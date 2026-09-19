<?php
/**
 * Keeps the index in step with the content.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

final class Sync {

	public const CRON_HOOK    = 'static_search_rebuild';
	public const DIRTY_OPTION = 'static_search_dirty';

	/** Seconds to wait after the last change before rebuilding, so a burst of edits costs one build. */
	private const DEBOUNCE = 20;

	public static function init(): void {
		add_action( 'save_post', array( self::class, 'on_save_post' ), 20, 2 );
		add_action( 'transition_post_status', array( self::class, 'on_transition' ), 10, 3 );
		add_action( 'deleted_post', array( self::class, 'on_deleted' ), 10, 2 );
		add_action( 'edited_term', array( self::class, 'mark_dirty' ) );
		add_action( 'delete_term', array( self::class, 'mark_dirty' ) );
		add_action( self::CRON_HOOK, array( self::class, 'run_scheduled' ) );

		// Saving the settings changes what goes into the index, so rebuild straight away.
		add_action( 'update_option_' . Settings::OPTION, array( self::class, 'rebuild_now' ) );
		add_action( 'add_option_' . Settings::OPTION, array( self::class, 'rebuild_now' ) );

		// Simply Static (free): refresh the index just before an export and make sure it is in it.
		// Neither hook exists when Simply Static is not installed, which is fine.
		add_action( 'ss_before_static_export', array( self::class, 'before_export' ) );
		add_filter( 'ss_additional_files', array( self::class, 'add_to_export' ) );
	}

	/**
	 * A published post was saved.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post.
	 */
	public static function on_save_post( int $post_id, \WP_Post $post ): void {
		if ( 'publish' !== $post->post_status || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		if ( self::is_tracked( $post->post_type ) ) {
			self::mark_dirty();
		}
	}

	/**
	 * A post was published, unpublished or trashed.
	 *
	 * @param string   $new_status New status.
	 * @param string   $old_status Old status.
	 * @param \WP_Post $post       Post.
	 */
	public static function on_transition( string $new_status, string $old_status, \WP_Post $post ): void {
		if ( $new_status !== $old_status && ( 'publish' === $new_status || 'publish' === $old_status ) && self::is_tracked( $post->post_type ) ) {
			self::mark_dirty();
		}
	}

	/**
	 * A post was deleted for good.
	 *
	 * @param int           $post_id Post ID.
	 * @param \WP_Post|null $post    Post, when WordPress passes it.
	 */
	public static function on_deleted( int $post_id, $post = null ): void {
		if ( ! $post instanceof \WP_Post || ( 'publish' === $post->post_status && self::is_tracked( $post->post_type ) ) ) {
			self::mark_dirty();
		}
	}

	/** Note that the index is out of date and queue a rebuild. */
	public static function mark_dirty(): void {
		update_option( self::DIRTY_OPTION, time(), false );
		if ( Settings::get( 'rebuild_on_save' ) && ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_single_event( time() + self::DEBOUNCE, self::CRON_HOOK );
		}
	}

	/** Cron callback. */
	public static function run_scheduled(): void {
		if ( Settings::get( 'rebuild_on_save' ) ) {
			Index::build();
		}
	}

	public static function rebuild_now(): void {
		Index::build();
	}

	/** Runs at the start of every Simply Static export. Never lets a failure block the export. */
	public static function before_export(): void {
		try {
			Index::build();
		} catch ( \Throwable $e ) {
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'Static Search: index rebuild before export failed: ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Add the index file to Simply Static's list of extra files.
	 *
	 * @param mixed $files Files already listed.
	 * @return array<int,string>
	 */
	public static function add_to_export( $files ): array {
		$files = is_array( $files ) ? $files : array();
		if ( Index::exists() ) {
			$files[] = Index::path();
		}
		return $files;
	}

	private static function is_tracked( string $post_type ): bool {
		return in_array( $post_type, (array) Settings::get( 'post_types' ), true );
	}
}
