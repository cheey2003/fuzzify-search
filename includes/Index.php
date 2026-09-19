<?php
/**
 * Builds the search index: one static JSON file the browser searches with Fuse.js.
 *
 * The file lives in the uploads folder, so it is served like any other file. That is what
 * lets it work on the live site and in a static export alike: no PHP runs at search time.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

final class Index {

	public const DIR            = 'static-search';
	public const FILE           = 'index.json';
	public const STATUS_OPTION  = 'static_search_status';
	public const META_EXCLUDE   = '_static_search_exclude';
	public const SCHEMA_VERSION = 1;

	/** Posts loaded per query, to keep memory flat on large sites. */
	private const BATCH = 200;

	/** Absolute path of the folder holding the index. */
	public static function directory(): string {
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['basedir'] ) . self::DIR;
	}

	/** Absolute path of the index file. */
	public static function path(): string {
		return self::directory() . '/' . self::FILE;
	}

	public static function exists(): bool {
		return is_readable( self::path() );
	}

	/** Full URL of the index file, for links in the admin. */
	public static function absolute_url(): string {
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['baseurl'] ) . self::DIR . '/' . self::FILE;
	}

	/**
	 * Site-root-relative URL of the index file, versioned so browsers pick up a rebuild.
	 * Relative on purpose: it stays valid whatever host the static export is served from.
	 */
	public static function url(): string {
		$url     = self::relative( self::absolute_url() );
		$version = (int) self::status()['generated'];
		return $version ? $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . 'ver=' . $version : $url;
	}

	/**
	 * What the last build produced.
	 *
	 * @return array{generated:int,count:int,bytes:int,gzip:int,error:string,error_time:int}
	 */
	public static function status(): array {
		$stored = get_option( self::STATUS_OPTION, array() );
		return array_merge(
			array(
				'generated'  => 0,
				'count'      => 0,
				'bytes'      => 0,
				'gzip'       => 0,
				'error'      => '',
				'error_time' => 0,
			),
			is_array( $stored ) ? $stored : array()
		);
	}

	/**
	 * Turn a URL on this site into a root-relative path; leave other hosts (a CDN) untouched.
	 *
	 * @param string $url URL.
	 */
	public static function relative( string $url ): string {
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return $url;
		}
		$home = wp_parse_url( home_url() );
		if ( ! empty( $home['host'] ) && strtolower( $parts['host'] ) !== strtolower( $home['host'] ) ) {
			return $url;
		}
		return ( $parts['path'] ?? '/' ) . ( isset( $parts['query'] ) ? '?' . $parts['query'] : '' );
	}

	/**
	 * Whether an item has been hidden from search from its edit screen.
	 *
	 * @param int $post_id Post ID.
	 */
	public static function is_flagged( int $post_id ): bool {
		return '1' === (string) get_post_meta( $post_id, self::META_EXCLUDE, true );
	}

	/**
	 * Build the index and write it to disk.
	 *
	 * @return array<string,int>|\WP_Error Status on success.
	 */
	public static function build() {
		$settings = Settings::all();
		$items    = self::collect( $settings );

		$json = wp_json_encode(
			array(
				'v'         => self::SCHEMA_VERSION,
				'generated' => gmdate( 'c' ),
				'count'     => count( $items ),
				'items'     => $items,
			),
			JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
		);
		if ( false === $json ) {
			return self::fail( 'static_search_json', __( 'The index could not be encoded as JSON.', 'subsite-static-search' ) );
		}

		$dir = self::directory();
		if ( ! wp_mkdir_p( $dir ) ) {
			/* translators: %s: folder path */
			return self::fail( 'static_search_dir', sprintf( __( 'Could not create %s. Check that the uploads folder is writable.', 'subsite-static-search' ), $dir ) );
		}
		if ( ! file_exists( $dir . '/index.php' ) ) {
			// Keeps the folder from being listed; PHP files are never exported.
			file_put_contents( $dir . '/index.php', "<?php\n// Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}

		// Write to a temporary file and rename, so a visitor never gets a half-written index.
		$tmp = $dir . '/' . self::FILE . '.' . wp_generate_password( 8, false ) . '.tmp';
		if ( false === file_put_contents( $tmp, $json, LOCK_EX ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return self::fail( 'static_search_write', __( 'Could not write the index file.', 'subsite-static-search' ) );
		}
		if ( ! rename( $tmp, self::path() ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename
			wp_delete_file( $tmp );
			return self::fail( 'static_search_rename', __( 'Could not replace the index file.', 'subsite-static-search' ) );
		}
		chmod( self::path(), 0644 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.chmod_chmod

		$gzip   = function_exists( 'gzencode' ) ? gzencode( $json, 6 ) : false;
		$status = array(
			'generated' => time(),
			'count'     => count( $items ),
			'bytes'     => strlen( $json ),
			'gzip'      => false === $gzip ? 0 : strlen( $gzip ),
		);
		update_option( self::STATUS_OPTION, $status, true ); // Read on every page load, so autoload it.
		delete_option( Sync::DIRTY_OPTION );

		/**
		 * Fires after the index file has been written.
		 *
		 * @param array $status Count and sizes.
		 */
		do_action( 'static_search_index_built', $status );

		return $status;
	}

	/**
	 * Remember a failure for the admin screen and return it as an error.
	 *
	 * @param string $code    Error code.
	 * @param string $message Message.
	 */
	private static function fail( string $code, string $message ): \WP_Error {
		update_option(
			self::STATUS_OPTION,
			array_merge(
				self::status(),
				array(
					'error'      => $message,
					'error_time' => time(),
				)
			),
			true
		);
		return new \WP_Error( $code, $message );
	}

	/**
	 * Gather the items to index, newest first.
	 *
	 * @param array<string,mixed> $settings Effective settings.
	 * @return array<int,array<string,mixed>>
	 */
	private static function collect( array $settings ): array {
		$types = array_values( array_filter( (array) $settings['post_types'], 'post_type_exists' ) );
		if ( ! $types ) {
			return array();
		}

		$fields  = (array) $settings['fields'];
		$skipped = self::skipped_ids( $settings );
		$items   = array();
		$paged   = 1;

		do {
			$query = new \WP_Query(
				array(
					'post_type'           => $types,
					'post_status'         => 'publish',
					'posts_per_page'      => self::BATCH,
					'paged'               => $paged,
					'orderby'             => array(
						'date' => 'DESC',
						'ID'   => 'DESC',
					),
					'no_found_rows'       => true,
					'ignore_sticky_posts' => true,
				)
			);

			foreach ( $query->posts as $post ) {
				if ( in_array( $post->ID, $skipped, true ) || self::is_flagged( $post->ID ) || self::is_hidden_product( $post ) ) {
					continue;
				}
				/**
				 * Filters whether a post goes into the index.
				 *
				 * @param bool     $include Whether to include it.
				 * @param \WP_Post $post    The post.
				 */
				if ( ! apply_filters( 'static_search_include_post', true, $post ) ) {
					continue;
				}
				$item = self::item( $post, $settings, $fields );
				if ( $item ) {
					$items[] = $item;
				}
			}

			$more = count( $query->posts ) === self::BATCH;
			++$paged;
		} while ( $more );

		return $items;
	}

	/**
	 * One index entry. Empty fields are left out to keep the file small.
	 *
	 * @param \WP_Post            $post     Post.
	 * @param array<string,mixed> $settings Effective settings.
	 * @param string[]            $fields   Optional fields to index.
	 * @return array<string,mixed>|null Null when the post has no title.
	 */
	private static function item( \WP_Post $post, array $settings, array $fields ): ?array {
		$title = self::text( $post->post_title );
		if ( '' === $title ) {
			return null;
		}

		$type_object = get_post_type_object( $post->post_type );
		$item        = array(
			'id'    => $post->ID,
			'title' => $title,
			'url'   => self::relative( (string) get_permalink( $post ) ),
			'type'  => $type_object ? (string) $type_object->labels->singular_name : $post->post_type,
			'pt'    => $post->post_type,
		);

		// A password-protected post appears by title only; its body must not leak into a public file.
		if ( '' === $post->post_password ) {
			$thumb_id = get_post_thumbnail_id( $post );
			$thumb    = $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'thumbnail' ) : false;
			if ( $thumb ) {
				$item['thumb'] = self::relative( $thumb );
			}
			if ( in_array( 'excerpt', $fields, true ) ) {
				$item['excerpt'] = self::text( $post->post_excerpt );
			}
			if ( in_array( 'content', $fields, true ) ) {
				$content = self::text( strip_shortcodes( $post->post_content ) );
				$limit   = (int) $settings['content_limit'];
				if ( $limit > 0 && mb_strlen( $content ) > $limit ) {
					$content = mb_substr( $content, 0, $limit );
				}
				$item['content'] = $content;
			}
			if ( in_array( 'terms', $fields, true ) ) {
				$item['terms'] = self::terms( $post );
			}
			if ( in_array( 'sku', $fields, true ) ) {
				$item['sku'] = self::text( (string) get_post_meta( $post->ID, '_sku', true ) );
			}
		}

		/**
		 * Filters one index entry, for adding fields or changing what is shown.
		 *
		 * @param array    $item Entry.
		 * @param \WP_Post $post The post.
		 */
		$item = (array) apply_filters( 'static_search_item', $item, $post );

		return array_filter(
			$item,
			static function ( $value ): bool {
				return '' !== $value && array() !== $value && null !== $value;
			}
		);
	}

	/**
	 * Plain text from HTML: no tags, decoded entities, single spaces.
	 *
	 * @param string $html HTML or text.
	 */
	private static function text( string $html ): string {
		$text  = html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$clean = preg_replace( '/\s+/u', ' ', $text );
		return trim( null === $clean ? $text : $clean );
	}

	/**
	 * Names of the visible taxonomy terms (categories, tags, product categories...).
	 *
	 * @param \WP_Post $post Post.
	 * @return string[]
	 */
	private static function terms( \WP_Post $post ): array {
		$names = array();
		foreach ( get_object_taxonomies( $post->post_type, 'objects' ) as $taxonomy ) {
			if ( ! $taxonomy->public || ! $taxonomy->show_ui ) {
				continue;
			}
			$terms = get_the_terms( $post, $taxonomy->name );
			if ( is_array( $terms ) ) {
				foreach ( $terms as $term ) {
					$names[] = self::text( $term->name );
				}
			}
		}
		return array_values( array_unique( array_filter( $names ) ) );
	}

	/** WooCommerce products set to "hidden" or "shop only" are not searchable in the shop either. */
	private static function is_hidden_product( \WP_Post $post ): bool {
		return 'product' === $post->post_type
			&& taxonomy_exists( 'product_visibility' )
			&& has_term( 'exclude-from-search', 'product_visibility', $post );
	}

	/**
	 * Pages that are never indexed: the results page itself and, optionally, the WooCommerce
	 * cart, checkout and account pages (dead ends in a static export).
	 *
	 * @param array<string,mixed> $settings Effective settings.
	 * @return int[]
	 */
	private static function skipped_ids( array $settings ): array {
		$ids = array( (int) $settings['results_page'] );
		if ( ! empty( $settings['skip_woo_pages'] ) && function_exists( 'wc_get_page_id' ) ) {
			foreach ( array( 'cart', 'checkout', 'myaccount' ) as $page ) {
				$ids[] = (int) wc_get_page_id( $page );
			}
		}
		return array_values( array_filter( $ids, static fn( int $id ): bool => $id > 0 ) );
	}
}
