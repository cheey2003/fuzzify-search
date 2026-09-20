<?php
/**
 * Settings storage, defaults and sanitising.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

/**
 * One option holds every setting; unset keys fall back to the defaults below.
 */
final class Settings {

	public const OPTION = 'static_search_settings';

	/** Optional fields that can go into the index (the title is always indexed). */
	public const FIELDS = array( 'excerpt', 'content', 'terms', 'sku' );

	/** Typo tolerance choices: lower is stricter. */
	public const THRESHOLDS = array( 0.2, 0.3, 0.4 );

	/**
	 * Default values. `post_types` is null until saved, meaning "every searchable type".
	 *
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		return array(
			'post_types'       => null,
			'fields'           => self::FIELDS,
			'content_limit'    => 0,
			'skip_woo_pages'   => true,
			'min_chars'        => 2,
			'delay'            => 120,
			'max_results'      => 7,
			'threshold'        => 0.3,
			'show_thumbs'      => true,
			'highlight'        => true,
			'snippets'         => true,
			'results_enabled'  => true,
			'results_page'     => 0,
			'results_per_page' => 20,
			'forward_old_search' => true,
			'rebuild_on_save'  => true,
			'ranking'          => array(
				'title'   => 1,
				'terms'   => 2,
				'sku'     => 2,
				'excerpt' => 3,
				'content' => 4,
			),
			'type_priority'    => array(),
			'type_mode'        => 'tie',
		);
	}

	/**
	 * Stored settings merged over the defaults, without the runtime filter. Used by the admin form.
	 *
	 * @return array<string,mixed>
	 */
	public static function stored(): array {
		$stored   = get_option( self::OPTION, array() );
		$stored   = is_array( $stored ) ? $stored : array();
		$settings = array_merge( self::defaults(), $stored );

		// Nested settings merge key by key, so a stored partial list keeps the other defaults.
		$settings['ranking']       = array_merge( self::defaults()['ranking'], is_array( $stored['ranking'] ?? null ) ? $stored['ranking'] : array() );
		$settings['type_priority'] = is_array( $settings['type_priority'] ) ? $settings['type_priority'] : array();

		if ( ! is_array( $settings['post_types'] ) ) {
			$settings['post_types'] = self::default_post_types();
		}
		return $settings;
	}

	/**
	 * Effective settings.
	 *
	 * @return array<string,mixed>
	 */
	public static function all(): array {
		/**
		 * Filters the effective Static Search settings.
		 *
		 * @param array $settings Settings.
		 */
		return (array) apply_filters( 'static_search_settings', self::stored() );
	}

	/**
	 * One effective setting.
	 *
	 * @param string $key Setting key.
	 * @return mixed Value, or null when the key is unknown.
	 */
	public static function get( string $key ) {
		$all = self::all();
		return $all[ $key ] ?? null;
	}

	/**
	 * Post types that can be indexed: public ones, minus attachments.
	 *
	 * @return array<string,string> Slug => plural label.
	 */
	public static function available_post_types(): array {
		$types = array();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $name => $object ) {
			if ( 'attachment' !== $name ) {
				$types[ $name ] = (string) $object->labels->name;
			}
		}
		return $types;
	}

	/**
	 * Post types WordPress' own search covers, minus attachments.
	 *
	 * @return string[]
	 */
	public static function default_post_types(): array {
		$types = get_post_types(
			array(
				'public'              => true,
				'exclude_from_search' => false,
			)
		);
		unset( $types['attachment'] );
		return array_values( $types );
	}

	/**
	 * Settings API sanitiser. Keys missing from the submitted data keep their current value,
	 * so partial updates (WP-CLI, code) never reset other settings.
	 *
	 * @param mixed $input Submitted value.
	 * @return array<string,mixed>
	 */
	public static function sanitize( $input ): array {
		$input = is_array( $input ) ? $input : array();
		$out   = self::stored();

		if ( array_key_exists( 'post_types', $input ) ) {
			$wanted            = array_map( 'sanitize_key', array_filter( (array) $input['post_types'], 'is_string' ) );
			$out['post_types'] = array_values( array_intersect( array_keys( self::available_post_types() ), $wanted ) );
		}
		if ( array_key_exists( 'fields', $input ) ) {
			$wanted        = array_map( 'sanitize_key', array_filter( (array) $input['fields'], 'is_string' ) );
			$out['fields'] = array_values( array_intersect( self::FIELDS, $wanted ) );
		}

		$out['content_limit']    = self::int_in( $input, 'content_limit', 0, 100000, (int) $out['content_limit'] );
		$out['min_chars']        = self::int_in( $input, 'min_chars', 1, 10, (int) $out['min_chars'] );
		$out['delay']            = self::int_in( $input, 'delay', 0, 2000, (int) $out['delay'] );
		$out['max_results']      = self::int_in( $input, 'max_results', 1, 20, (int) $out['max_results'] );
		$out['results_per_page'] = self::int_in( $input, 'results_per_page', 5, 100, (int) $out['results_per_page'] );

		foreach ( array( 'skip_woo_pages', 'show_thumbs', 'highlight', 'snippets', 'rebuild_on_save', 'forward_old_search', 'results_enabled' ) as $key ) {
			if ( array_key_exists( $key, $input ) ) {
				$out[ $key ] = (bool) (int) $input[ $key ];
			}
		}

		if ( array_key_exists( 'threshold', $input ) ) {
			$threshold        = round( (float) $input['threshold'], 1 );
			$out['threshold'] = in_array( $threshold, self::THRESHOLDS, true ) ? $threshold : (float) $out['threshold'];
		}

		if ( array_key_exists( 'results_page', $input ) ) {
			$page_id             = absint( $input['results_page'] );
			$out['results_page'] = ( $page_id > 0 && 'page' === get_post_type( $page_id ) ) ? $page_id : 0;
		}

		if ( array_key_exists( 'ranking', $input ) && is_array( $input['ranking'] ) ) {
			foreach ( array_keys( self::defaults()['ranking'] ) as $field ) {
				if ( array_key_exists( $field, $input['ranking'] ) ) {
					$out['ranking'][ $field ] = max( 1, min( 5, (int) $input['ranking'][ $field ] ) );
				}
			}
		}

		if ( array_key_exists( 'type_priority', $input ) && is_array( $input['type_priority'] ) ) {
			$available  = array_keys( self::available_post_types() );
			$priorities = array();
			foreach ( $input['type_priority'] as $slug => $value ) {
				$slug = sanitize_key( (string) $slug );
				if ( in_array( $slug, $available, true ) ) {
					$priorities[ $slug ] = max( 1, min( 99, (int) $value ) );
				}
			}
			$out['type_priority'] = $priorities;
		}

		if ( array_key_exists( 'type_mode', $input ) ) {
			$out['type_mode'] = in_array( $input['type_mode'], array( 'tie', 'first' ), true ) ? $input['type_mode'] : 'tie';
		}

		return $out;
	}

	/**
	 * Clamp a submitted integer, or return the fallback when the key was not submitted.
	 *
	 * @param array<string,mixed> $input    Submitted data.
	 * @param string              $key      Key.
	 * @param int                 $min      Minimum.
	 * @param int                 $max      Maximum.
	 * @param int                 $fallback Value to keep when the key is absent.
	 */
	private static function int_in( array $input, string $key, int $min, int $max, int $fallback ): int {
		if ( ! array_key_exists( $key, $input ) ) {
			return $fallback;
		}
		return max( $min, min( $max, (int) $input[ $key ] ) );
	}
}
