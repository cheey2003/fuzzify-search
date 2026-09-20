<?php
/**
 * Front end: loads the search script and provides the results page shortcode.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

final class Frontend {

	public const SHORTCODE = 'static_search_results';

	public static function init(): void {
		add_action( 'wp_enqueue_scripts', array( self::class, 'enqueue' ) );
		add_shortcode( self::SHORTCODE, array( self::class, 'shortcode' ) );
		add_action( 'wp_head', array( self::class, 'forward_old_searches' ), 1 );
		add_filter( 'wp_robots', array( self::class, 'robots' ) );
		add_filter( 'aioseo_robots_meta', array( self::class, 'aioseo_robots' ) );
	}

	/**
	 * Load the script and styles. With no index file yet, nothing is loaded and visitors keep
	 * the normal WordPress search.
	 */
	public static function enqueue(): void {
		if ( ! Index::exists() ) {
			return;
		}

		wp_enqueue_style( 'static-search', STATIC_SEARCH_URL . 'assets/css/static-search.css', array(), self::asset_version( STATIC_SEARCH_DIR . 'assets/css/static-search.css' ) );
		wp_enqueue_script(
			'static-search',
			STATIC_SEARCH_URL . 'assets/js/static-search.js',
			array(),
			self::asset_version( STATIC_SEARCH_DIR . 'assets/js/static-search.js' ),
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		wp_add_inline_script( 'static-search', 'window.StaticSearchConfig=' . wp_json_encode( self::config() ) . ';', 'before' );
	}

	/**
	 * Version string for a stylesheet or script: the plugin version plus that file's own modified time.
	 * Every file needs its own, or a browser or CDN keeps serving an older copy of a file that changed
	 * without the plugin version changing.
	 *
	 * @param string $file Absolute path.
	 */
	public static function asset_version( string $file ): string {
		return STATIC_SEARCH_VERSION . '.' . (string) ( is_readable( $file ) ? (int) filemtime( $file ) : 0 );
	}

	/**
	 * Settings the script needs. All URLs are site-relative so they survive a move to another host.
	 *
	 * @return array<string,mixed>
	 */
	public static function config(): array {
		$settings = Settings::all();
		$fields   = (array) $settings['fields'];

		$config = array(
			'indexUrl'   => Index::url(),
			'resultsUrl' => self::results_url(),
			// What Enter does: go to the results page, fall back to the browser's own search (no page to go to), or nothing (switched off).
			'enter'      => ! $settings['results_enabled'] ? 'none' : ( '' !== self::results_page_url() ? 'results' : 'native' ),
			'selector'   => (string) apply_filters( 'static_search_selector', 'input[type="search"][name="s"]' ),
			// The title is always searched; the rest depends on the fields chosen in the settings.
			'fields'     => array_merge( array( 'title' ), $fields ),
			'threshold'  => (float) $settings['threshold'],
			'minChars'   => (int) $settings['min_chars'],
			'delay'      => (int) $settings['delay'],
			'maxResults' => (int) $settings['max_results'],
			'perPage'    => (int) $settings['results_per_page'],
			'thumbs'     => (bool) $settings['show_thumbs'],
			'highlight'  => (bool) $settings['highlight'],
			'snippets'   => (bool) $settings['snippets'],
			'rank'       => (array) $settings['ranking'],
			'typeRank'   => (array) $settings['type_priority'],
			'typeMode'   => (string) $settings['type_mode'],
			'i18n'       => array(
				'searchTitle' => __( 'Search', 'subsite-static-search' ),
				'prompt'      => __( 'Type what you are looking for in the search box.', 'subsite-static-search' ),
				/* translators: %s: the search query */
				'resultsFor'  => __( 'Search results for “%s”', 'subsite-static-search' ),
				'loading'     => __( 'Searching…', 'subsite-static-search' ),
				'one'         => __( '1 result', 'subsite-static-search' ),
				/* translators: %d: number of results */
				'many'        => __( '%d results', 'subsite-static-search' ),
				'none'        => __( 'No results found.', 'subsite-static-search' ),
				'more'        => __( 'Show more', 'subsite-static-search' ),
				/* translators: %d: number of results */
				'viewAll'     => __( 'View all %d results', 'subsite-static-search' ),
				'unavailable' => __( 'Search is unavailable right now. Please try again later.', 'subsite-static-search' ),
			),
		);

		/**
		 * Filters the configuration passed to the search script.
		 *
		 * @param array $config Configuration.
		 */
		return (array) apply_filters( 'static_search_config', $config );
	}

	/**
	 * The address Enter goes to: the results page's, or an empty string when none is set or the
	 * results page has been switched off in the settings.
	 */
	public static function results_url(): string {
		return Settings::get( 'results_enabled' ) ? self::results_page_url() : '';
	}

	/** Site-relative address of the chosen results page, or an empty string when none is set, whether or not it is switched on. */
	public static function results_page_url(): string {
		$page_id = (int) Settings::get( 'results_page' );
		if ( $page_id < 1 || 'publish' !== get_post_status( $page_id ) ) {
			return '';
		}
		return Index::relative( (string) get_permalink( $page_id ) );
	}

	/**
	 * Markup for the results page. The script fills it in from the address' ?q= value.
	 */
	public static function shortcode(): string {
		ob_start();
		?>
		<div class="static-search-page" data-static-search-page>
			<h2 class="static-search-page__title" data-static-search-title><?php esc_html_e( 'Search', 'subsite-static-search' ); ?></h2>
			<p class="static-search-page__status" role="status" aria-live="polite" data-static-search-status></p>
			<ol class="static-search-page__list" data-static-search-list></ol>
			<button type="button" class="static-search-page__more button" data-static-search-more hidden></button>
			<noscript><p><?php esc_html_e( 'Search needs JavaScript. Please turn it on and reload this page.', 'subsite-static-search' ); ?></p></noscript>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Print the small script that forwards an old-style search address (/?s=term) to the results
	 * page. A live WordPress site answers such an address itself, so the script is left out of the
	 * pages WordPress renders as search results; a static host answers with the plain page, which is
	 * where the script does its work.
	 */
	public static function forward_old_searches(): void {
		if ( is_search() || is_admin() || ! Settings::get( 'forward_old_search' ) ) {
			return;
		}
		$url  = self::results_url();
		$file = STATIC_SEARCH_DIR . 'assets/js/static-search-forward.js';
		if ( '' === $url || ! is_readable( $file ) ) {
			return;
		}
		// The script is our own build output and the address is JSON-encoded for safe use inside <script>.
		echo '<script id="static-search-forward">window.StaticSearchForward=' . wp_json_encode( $url, JSON_HEX_TAG | JSON_HEX_AMP ) . ';' . (string) file_get_contents( $file ) . "</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped, WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	}

	/**
	 * Keep the results page out of search engines: it is empty until the script runs.
	 *
	 * @param array<string,mixed> $robots Robots directives.
	 * @return array<string,mixed>
	 */
	public static function robots( array $robots ): array {
		if ( self::is_results_page() ) {
			$robots['noindex'] = true;
			$robots['follow']  = true;
		}
		return $robots;
	}

	/**
	 * Same, for All in One SEO, which replaces WordPress' robots tag with its own.
	 *
	 * @param mixed $attributes AIOSEO robots attributes.
	 * @return array<string,string>
	 */
	public static function aioseo_robots( $attributes ): array {
		$attributes = is_array( $attributes ) ? $attributes : array();
		if ( self::is_results_page() ) {
			$attributes['noindex'] = 'noindex';
		}
		return $attributes;
	}

	private static function is_results_page(): bool {
		$page_id = (int) Settings::get( 'results_page' );
		return $page_id > 0 && is_page( $page_id );
	}
}
