<?php
/**
 * Admin: settings screen under Settings → Static Search, and the per-item exclude box.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

final class Admin {

	private const PAGE       = 'static-search';
	private const GROUP      = 'static_search';
	private const NONCE_META = 'static_search_exclude_meta';

	/** Above this size (bytes) the screen suggests trimming the index. */
	private const LARGE_INDEX = 2097152;

	public static function init(): void {
		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'admin_init', array( self::class, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( self::class, 'assets' ) );
		add_action( 'admin_post_static_search_rebuild', array( self::class, 'handle_rebuild' ) );
		add_action( 'add_meta_boxes', array( self::class, 'add_meta_box' ) );
		add_action( 'save_post', array( self::class, 'save_meta' ), 10, 2 );
		add_filter( 'display_post_states', array( self::class, 'post_states' ), 10, 2 );
		add_filter( 'plugin_action_links_' . plugin_basename( STATIC_SEARCH_FILE ), array( self::class, 'action_links' ) );
	}

	public static function menu(): void {
		add_options_page(
			__( 'Static Search', 'subsite-static-search' ),
			__( 'Static Search', 'subsite-static-search' ),
			'manage_options',
			self::PAGE,
			array( self::class, 'render' )
		);
	}

	public static function register(): void {
		register_setting(
			self::GROUP,
			Settings::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( Settings::class, 'sanitize' ),
				'default'           => Settings::defaults(),
			)
		);
	}

	/**
	 * @param string $hook Current admin page hook.
	 */
	public static function assets( string $hook ): void {
		if ( 'settings_page_' . self::PAGE !== $hook ) {
			return;
		}
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_style( 'static-search-select2', STATIC_SEARCH_URL . 'assets/vendor/select2/select2.min.css', array(), Frontend::asset_version( STATIC_SEARCH_DIR . 'assets/vendor/select2/select2.min.css' ) );
		wp_enqueue_style( 'static-search-admin', STATIC_SEARCH_URL . 'assets/css/admin.css', array( 'static-search-select2' ), Frontend::asset_version( STATIC_SEARCH_DIR . 'assets/css/admin.css' ) );
		wp_enqueue_script( 'static-search-select2', STATIC_SEARCH_URL . 'assets/vendor/select2/select2.min.js', array( 'jquery' ), Frontend::asset_version( STATIC_SEARCH_DIR . 'assets/vendor/select2/select2.min.js' ), true );

		wp_enqueue_script(
			'static-search-admin',
			STATIC_SEARCH_URL . 'assets/js/static-search-admin.js',
			array( 'static-search-select2', 'wp-color-picker' ),
			Frontend::asset_version( STATIC_SEARCH_DIR . 'assets/js/static-search-admin.js' ),
			array(
				'in_footer' => true,
				'strategy'  => 'defer',
			)
		);
		wp_add_inline_script( 'static-search-admin', 'window.StaticSearchAdmin=' . wp_json_encode( self::preview_config() ) . ';', 'before' );
	}

	/**
	 * Labels of the fields that can be ranked.
	 *
	 * @return array<string,string>
	 */
	public static function rank_labels(): array {
		return array(
			'title'   => __( 'Title', 'subsite-static-search' ),
			'terms'   => __( 'Categories and tags', 'subsite-static-search' ),
			'sku'     => __( 'SKU', 'subsite-static-search' ),
			'excerpt' => __( 'Excerpt', 'subsite-static-search' ),
			'content' => __( 'Body text', 'subsite-static-search' ),
		);
	}

	/**
	 * What the "Try it" box script needs.
	 *
	 * @return array<string,mixed>
	 */
	public static function preview_config(): array {
		return array(
			'indexUrl' => Index::url(),
			'labels'   => self::rank_labels(),
			'i18n'     => array(
				'prompt'      => __( 'Type a word or two to see how results would be ranked.', 'subsite-static-search' ),
				'loading'     => __( 'Loading the index…', 'subsite-static-search' ),
				'unavailable' => __( 'The index could not be loaded. Rebuild it first.', 'subsite-static-search' ),
				'none'        => __( 'No results.', 'subsite-static-search' ),
				'noPages'     => __( 'No pages match.', 'subsite-static-search' ),
				'one'         => __( '1 result', 'subsite-static-search' ),
				/* translators: %d: number of results */
				'many'        => __( '%d results', 'subsite-static-search' ),
				/* translators: 1: number shown, 2: total number of results */
				'showing'     => __( 'Showing the first %1$d of %2$d results', 'subsite-static-search' ),
				/* translators: 1: item name, 2: its new position, 3: number of items */
				'moved'       => __( 'Moved %1$s to position %2$d of %3$d.', 'subsite-static-search' ),
			),
		);
	}

	/**
	 * @param array<int,string> $links Action links.
	 * @return array<int,string>
	 */
	public static function action_links( array $links ): array {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'subsite-static-search' ) . '</a>' );
		return $links;
	}

	/** "Rebuild index now" button. */
	public static function handle_rebuild(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do this.', 'subsite-static-search' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'static_search_rebuild' );

		$result = Index::build();
		$args   = array( 'page' => self::PAGE );
		if ( is_wp_error( $result ) ) {
			$args['static-search-error'] = $result->get_error_message();
		} else {
			$args['static-search-rebuilt'] = (string) $result['count'];
		}
		wp_safe_redirect( add_query_arg( $args, admin_url( 'options-general.php' ) ) );
		exit;
	}

	// Settings screen -------------------------------------------------------------------------

	public static function render(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap static-search-admin">
			<h1><?php esc_html_e( 'Static Search', 'subsite-static-search' ); ?></h1>
			<p class="description"><?php esc_html_e( 'Search that runs in the visitor’s browser from one index file, so it works on this site and in static HTML exports.', 'subsite-static-search' ); ?></p>
			<?php
			settings_errors();
			self::render_notices();
			self::render_status();
			self::render_form();
			self::render_excluded();
			?>
		</div>
		<?php
	}

	private static function render_notices(): void {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- display only.
		if ( isset( $_GET['static-search-rebuilt'] ) ) {
			$count = absint( $_GET['static-search-rebuilt'] );
			/* translators: %s: number of items */
			$message = sprintf( _n( 'Index rebuilt: %s item.', 'Index rebuilt: %s items.', $count, 'subsite-static-search' ), number_format_i18n( $count ) );
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( $message ) . '</p></div>';
		}
		if ( isset( $_GET['static-search-error'] ) ) {
			$error = sanitize_text_field( wp_unslash( $_GET['static-search-error'] ) );
			echo '<div class="notice notice-error"><p>' . esc_html( $error ) . '</p></div>';
		}
		// phpcs:enable

		foreach ( self::warnings() as $warning ) {
			echo '<div class="notice notice-warning"><p>' . wp_kses( $warning, array( 'code' => array() ) ) . '</p></div>';
		}
	}

	/**
	 * Things that will stop search working as expected.
	 *
	 * @return string[] Messages (may contain <code>).
	 */
	private static function warnings(): array {
		$warnings = array();
		$status   = Index::status();

		if ( '' !== $status['error'] ) {
			/* translators: 1: error message, 2: how long ago */
			$warnings[] = sprintf( __( 'The last index build failed: %1$s (%2$s ago)', 'subsite-static-search' ), esc_html( $status['error'] ), esc_html( human_time_diff( $status['error_time'] ) ) );
		}
		if ( ! Index::exists() ) {
			$warnings[] = esc_html__( 'There is no index file yet, so visitors still get the normal WordPress search. Press “Rebuild index now”.', 'subsite-static-search' );
		}
		if ( ! get_option( 'permalink_structure' ) ) {
			$warnings[] = esc_html__( 'Pretty permalinks are off. The results page needs them to work in a static export.', 'subsite-static-search' );
		}
		if ( Settings::get( 'results_enabled' ) && '' === Frontend::results_page_url() ) {
			$warnings[] = esc_html__( 'No results page is set. Pressing Enter in a search box falls back to the normal WordPress results page, which a static export cannot provide.', 'subsite-static-search' );
		}
		if ( $status['bytes'] > self::LARGE_INDEX ) {
			/* translators: %s: file size */
			$warnings[] = sprintf( __( 'The index is %s. Every visitor downloads it the first time they search; consider setting a content length limit below.', 'subsite-static-search' ), esc_html( size_format( $status['bytes'] ) ) );
		}
		if ( self::searchwp_live_active() ) {
			$warnings[] = esc_html__( 'SearchWP Live Ajax Search is active. Static Search leaves the search fields it has already taken over alone; deactivate it to use Static Search everywhere.', 'subsite-static-search' );
		}

		return $warnings;
	}

	private static function searchwp_live_active(): bool {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return is_plugin_active( 'searchwp-live-ajax-search/searchwp-live-ajax-search.php' );
	}

	private static function render_status(): void {
		$status = Index::status();
		$dirty  = (int) get_option( Sync::DIRTY_OPTION, 0 );

		if ( ! Index::exists() ) {
			$state = __( 'No index file', 'subsite-static-search' );
		} elseif ( $dirty > $status['generated'] ) {
			$state = Settings::get( 'rebuild_on_save' )
				? __( 'Content changed since the last build; it will be rebuilt shortly.', 'subsite-static-search' )
				: __( 'Content changed since the last build. Rebuild to include the changes.', 'subsite-static-search' );
		} else {
			$state = __( 'Up to date', 'subsite-static-search' );
		}

		$page_id = (int) Settings::get( 'results_page' );
		?>
		<h2><?php esc_html_e( 'Index', 'subsite-static-search' ); ?></h2>
		<table class="widefat striped static-search-status" role="presentation">
			<tbody>
				<tr>
					<th scope="row"><?php esc_html_e( 'Items indexed', 'subsite-static-search' ); ?></th>
					<td><?php echo esc_html( number_format_i18n( $status['count'] ) ); ?></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Index file', 'subsite-static-search' ); ?></th>
					<td>
						<?php if ( Index::exists() ) : ?>
							<a href="<?php echo esc_url( Index::absolute_url() ); ?>" target="_blank" rel="noopener"><code><?php echo esc_html( Index::relative( Index::absolute_url() ) ); ?></code></a>
							<?php
							/* translators: 1: file size, 2: gzipped size */
							printf( ' &middot; %s', esc_html( sprintf( __( '%1$s (about %2$s compressed)', 'subsite-static-search' ), size_format( $status['bytes'] ), size_format( max( 1, $status['gzip'] ) ) ) ) );
							?>
						<?php else : ?>
							&mdash;
						<?php endif; ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Last built', 'subsite-static-search' ); ?></th>
					<td>
						<?php
						if ( $status['generated'] ) {
							/* translators: 1: time difference, 2: date and time */
							echo esc_html( sprintf( __( '%1$s ago (%2$s)', 'subsite-static-search' ), human_time_diff( $status['generated'] ), wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $status['generated'] ) ) );
						} else {
							echo '&mdash;';
						}
						?>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'State', 'subsite-static-search' ); ?></th>
					<td><?php echo esc_html( $state ); ?></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Results page', 'subsite-static-search' ); ?></th>
					<td>
						<?php if ( ! Settings::get( 'results_enabled' ) ) : ?>
							<?php esc_html_e( 'Off: pressing Enter does nothing', 'subsite-static-search' ); ?>
						<?php elseif ( $page_id > 0 && 'publish' === get_post_status( $page_id ) ) : ?>
							<a href="<?php echo esc_url( (string) get_permalink( $page_id ) ); ?>"><?php echo esc_html( get_the_title( $page_id ) ); ?></a>
						<?php else : ?>
							&mdash;
						<?php endif; ?>
					</td>
				</tr>
			</tbody>
		</table>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="static-search-rebuild">
			<input type="hidden" name="action" value="static_search_rebuild">
			<?php wp_nonce_field( 'static_search_rebuild' ); ?>
			<?php submit_button( __( 'Rebuild index now', 'subsite-static-search' ), 'secondary', 'submit', false ); ?>
		</form>
		<?php
	}

	private static function render_form(): void {
		$settings = Settings::stored();
		$name     = Settings::OPTION;
		$fields   = array(
			'excerpt' => __( 'Excerpt (product short description)', 'subsite-static-search' ),
			'content' => __( 'Content', 'subsite-static-search' ),
			'terms'   => __( 'Categories, tags and other taxonomy terms', 'subsite-static-search' ),
			'sku'     => __( 'Product SKU', 'subsite-static-search' ),
		);
		?>
		<form method="post" action="options.php">
			<?php settings_fields( self::GROUP ); ?>

			<h2><?php esc_html_e( 'What to search', 'subsite-static-search' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Post types', 'subsite-static-search' ); ?></th>
					<td>
						<fieldset>
							<input type="hidden" name="<?php echo esc_attr( $name ); ?>[post_types][]" value="">
							<?php foreach ( Settings::available_post_types() as $slug => $label ) : ?>
								<?php $count = (int) ( wp_count_posts( $slug )->publish ?? 0 ); ?>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[post_types][]" value="<?php echo esc_attr( $slug ); ?>" <?php checked( in_array( $slug, (array) $settings['post_types'], true ) ); ?>>
									<?php echo esc_html( $label ); ?> <span class="description">(<?php echo esc_html( number_format_i18n( $count ) ); ?>)</span>
								</label><br>
							<?php endforeach; ?>
						</fieldset>
						<p class="description"><?php esc_html_e( 'Only published items are indexed.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Fields to search', 'subsite-static-search' ); ?></th>
					<td>
						<fieldset>
							<input type="hidden" name="<?php echo esc_attr( $name ); ?>[fields][]" value="">
							<label><input type="checkbox" checked disabled> <?php esc_html_e( 'Title (always)', 'subsite-static-search' ); ?></label><br>
							<?php foreach ( $fields as $key => $label ) : ?>
								<label>
									<input type="checkbox" name="<?php echo esc_attr( $name ); ?>[fields][]" value="<?php echo esc_attr( $key ); ?>" <?php checked( in_array( $key, (array) $settings['fields'], true ) ); ?>>
									<?php echo esc_html( $label ); ?>
								</label><br>
							<?php endforeach; ?>
						</fieldset>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="static-search-content-limit"><?php esc_html_e( 'Content length limit', 'subsite-static-search' ); ?></label></th>
					<td>
						<input type="number" id="static-search-content-limit" class="small-text" min="0" max="100000" step="100" name="<?php echo esc_attr( $name ); ?>[content_limit]" value="<?php echo esc_attr( (string) $settings['content_limit'] ); ?>">
						<?php esc_html_e( 'characters per item (0 = no limit)', 'subsite-static-search' ); ?>
						<p class="description"><?php esc_html_e( 'A limit keeps the index small on sites with a lot of long content.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
				<?php if ( function_exists( 'wc_get_page_id' ) ) : ?>
					<tr>
						<th scope="row"><?php esc_html_e( 'WooCommerce', 'subsite-static-search' ); ?></th>
						<td>
							<?php self::checkbox( $name . '[skip_woo_pages]', (bool) $settings['skip_woo_pages'], __( 'Leave out the Cart, Checkout and My account pages', 'subsite-static-search' ) ); ?>
							<p class="description"><?php esc_html_e( 'Products set to hidden or “shop only” are always left out, as in WooCommerce’s own search.', 'subsite-static-search' ); ?></p>
						</td>
					</tr>
				<?php endif; ?>
			</table>

			<?php self::render_ranking( $settings ); ?>

			<h2><?php esc_html_e( 'Search box', 'subsite-static-search' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="static-search-min-chars"><?php esc_html_e( 'Start searching after', 'subsite-static-search' ); ?></label></th>
					<td>
						<input type="number" id="static-search-min-chars" class="small-text" min="1" max="10" name="<?php echo esc_attr( $name ); ?>[min_chars]" value="<?php echo esc_attr( (string) $settings['min_chars'] ); ?>">
						<?php esc_html_e( 'characters', 'subsite-static-search' ); ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="static-search-delay"><?php esc_html_e( 'Wait after typing', 'subsite-static-search' ); ?></label></th>
					<td>
						<input type="number" id="static-search-delay" class="small-text" min="0" max="2000" step="10" name="<?php echo esc_attr( $name ); ?>[delay]" value="<?php echo esc_attr( (string) $settings['delay'] ); ?>">
						<?php esc_html_e( 'milliseconds', 'subsite-static-search' ); ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="static-search-max-results"><?php esc_html_e( 'Results in the dropdown', 'subsite-static-search' ); ?></label></th>
					<td><input type="number" id="static-search-max-results" class="small-text" min="1" max="20" name="<?php echo esc_attr( $name ); ?>[max_results]" value="<?php echo esc_attr( (string) $settings['max_results'] ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="static-search-threshold"><?php esc_html_e( 'Typo tolerance', 'subsite-static-search' ); ?></label></th>
					<td>
						<select id="static-search-threshold" name="<?php echo esc_attr( $name ); ?>[threshold]">
							<option value="0.2" <?php selected( (float) $settings['threshold'], 0.2 ); ?>><?php esc_html_e( 'Strict: close matches only', 'subsite-static-search' ); ?></option>
							<option value="0.3" <?php selected( (float) $settings['threshold'], 0.3 ); ?>><?php esc_html_e( 'Balanced (recommended)', 'subsite-static-search' ); ?></option>
							<option value="0.4" <?php selected( (float) $settings['threshold'], 0.4 ); ?>><?php esc_html_e( 'Loose: more, less exact results', 'subsite-static-search' ); ?></option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Thumbnails', 'subsite-static-search' ); ?></th>
					<td><?php self::checkbox( $name . '[show_thumbs]', (bool) $settings['show_thumbs'], __( 'Show a thumbnail next to each result', 'subsite-static-search' ) ); ?></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Matches', 'subsite-static-search' ); ?></th>
					<td>
						<?php self::checkbox( $name . '[highlight]', (bool) $settings['highlight'], __( 'Highlight the words that matched', 'subsite-static-search' ) ); ?><br>
						<?php self::checkbox( $name . '[snippets]', (bool) $settings['snippets'], __( 'Show a piece of the text around the match', 'subsite-static-search' ) ); ?>
						<p class="description"><?php esc_html_e( 'The text is shown under a result when the words were found in its excerpt or body text rather than its title, so those fields need to be searched (Fields to search). A word matched with a typo is not highlighted.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="static-search-highlight-color"><?php esc_html_e( 'Highlight colour', 'subsite-static-search' ); ?></label></th>
					<td>
						<input type="text" id="static-search-highlight-color" class="static-search-color-field" name="<?php echo esc_attr( $name ); ?>[highlight_color]" value="<?php echo esc_attr( (string) $settings['highlight_color'] ); ?>" data-default-color="<?php echo esc_attr( Settings::HIGHLIGHT_COLOR ); ?>" maxlength="7">
						<p class="description"><?php esc_html_e( 'The colour of the matched words. One colour is used on light and dark backgrounds; the default is a green that is lighter on dark backgrounds. Pick one that stands out on your results background.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
			</table>

			<h2><?php esc_html_e( 'Results page', 'subsite-static-search' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Activate', 'subsite-static-search' ); ?></th>
					<td>
						<?php self::checkbox( $name . '[results_enabled]', (bool) $settings['results_enabled'], __( 'Send Enter to the results page', 'subsite-static-search' ) ); ?>
						<p class="description"><?php esc_html_e( 'When unticked, pressing Enter in a search box does nothing. The dropdown of instant results still works, and a highlighted result still opens on Enter, but the dropdown then shows at most the number set under Search box, with no “View all” link.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
				<tr data-results-dependent>
					<th scope="row"><label for="static-search-results-page"><?php esc_html_e( 'Page', 'subsite-static-search' ); ?></label></th>
					<td>
						<?php
						wp_dropdown_pages(
							array(
								'name'              => $name . '[results_page]',
								'id'                => 'static-search-results-page',
								'selected'          => (int) $settings['results_page'],
								'show_option_none'  => __( '— None (normal WordPress results) —', 'subsite-static-search' ),
								'option_none_value' => '0',
							)
						);
						?>
						<p class="description">
							<?php
							printf(
								/* translators: %s: shortcode */
								esc_html__( 'Where pressing Enter in a search box goes. The page must contain the %s shortcode; the one created on activation does.', 'subsite-static-search' ),
								'<code>[' . esc_html( Frontend::SHORTCODE ) . ']</code>'
							);
							?>
						</p>
					</td>
				</tr>
				<tr data-results-dependent>
					<th scope="row"><label for="static-search-per-page"><?php esc_html_e( 'Results per page', 'subsite-static-search' ); ?></label></th>
					<td><input type="number" id="static-search-per-page" class="small-text" min="5" max="100" name="<?php echo esc_attr( $name ); ?>[results_per_page]" value="<?php echo esc_attr( (string) $settings['results_per_page'] ); ?>"></td>
				</tr>
				<tr data-results-dependent>
					<th scope="row"><?php esc_html_e( 'Old search addresses', 'subsite-static-search' ); ?></th>
					<td>
						<?php self::checkbox( $name . '[forward_old_search]', (bool) $settings['forward_old_search'], __( 'Send /?s=term addresses to the results page', 'subsite-static-search' ) ); ?>
						<p class="description"><?php esc_html_e( 'A static site cannot answer /?s=term: it serves the plain page. With this on, anything that still links to such an address (bookmarks, other sites) is forwarded to the results page. On a live WordPress site, WordPress’ own results page is left alone.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
			</table>

			<h2><?php esc_html_e( 'Keeping the index current', 'subsite-static-search' ); ?></h2>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Automatic rebuild', 'subsite-static-search' ); ?></th>
					<td>
						<?php self::checkbox( $name . '[rebuild_on_save]', (bool) $settings['rebuild_on_save'], __( 'Rebuild shortly after content is published, changed or removed', 'subsite-static-search' ) ); ?>
						<p class="description"><?php esc_html_e( 'The index is also rebuilt when you save these settings and at the start of every Simply Static export.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
			</table>

			<?php submit_button(); ?>
		</form>
		<?php
	}

	/**
	 * The "Result ranking" section: field order, post type order and the "Try it" box.
	 *
	 * @param array<string,mixed> $settings Stored settings.
	 */
	private static function render_ranking( array $settings ): void {
		$name     = Settings::OPTION;
		$rank     = array_map( 'intval', (array) $settings['ranking'] );
		$priority = array_map( 'intval', (array) $settings['type_priority'] );
		$types    = array_intersect_key( Settings::available_post_types(), array_flip( (array) $settings['post_types'] ) );
		?>
		<h2><?php esc_html_e( 'Result ranking', 'subsite-static-search' ); ?></h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><?php esc_html_e( 'Field priority', 'subsite-static-search' ); ?></th>
				<td>
					<?php self::render_rank_list( $name . '[ranking]', self::by_rank( self::rank_labels(), $rank, 1 ), $rank, 1 ); ?>
					<p class="description"><?php esc_html_e( 'Drag the rows, or use the arrows, to set the order: the top row ranks first, and a match in a higher row always ranks above a match in a lower one. Tick “Same priority as above” to rank a field together with the row above it. Within a priority, whole-word matches come before matches inside a word, then newest first. Fields you do not search above are ignored.', 'subsite-static-search' ); ?></p>
				</td>
			</tr>
			<?php if ( count( $types ) > 1 ) : ?>
				<tr>
					<th scope="row"><?php esc_html_e( 'Post type priority', 'subsite-static-search' ); ?></th>
					<td>
						<?php self::render_rank_list( $name . '[type_priority]', self::by_rank( $types, $priority, 1 ), $priority, 1 ); ?>
						<fieldset>
							<label>
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[type_mode]" value="tie" <?php checked( 'first' !== $settings['type_mode'] ); ?>>
								<?php esc_html_e( 'Only between equally good matches (recommended)', 'subsite-static-search' ); ?>
							</label><br>
							<label>
								<input type="radio" name="<?php echo esc_attr( $name ); ?>[type_mode]" value="first" <?php checked( 'first' === $settings['type_mode'] ); ?>>
								<?php esc_html_e( 'Before everything else', 'subsite-static-search' ); ?>
							</label>
						</fieldset>
						<p class="description"><?php esc_html_e( 'Drag to set the order. By default every type shares one priority, which means no preference. With the first choice, a Product and a Post that match equally well are ordered by this list. With the second, every result of the top type comes before any of the next, whatever the field.', 'subsite-static-search' ); ?></p>
					</td>
				</tr>
			<?php endif; ?>
			<tr>
				<th scope="row"><label for="static-search-preview-input"><?php esc_html_e( 'Try it', 'subsite-static-search' ); ?></label></th>
				<td>
					<div class="static-search-preview" data-preview>
						<input type="search" id="static-search-preview-input" class="regular-text" data-preview-input autocomplete="off" placeholder="<?php echo esc_attr__( 'Try a search…', 'subsite-static-search' ); ?>">
						<p class="description" data-preview-status role="status" aria-live="polite"></p>
						<table class="widefat striped" data-preview-table hidden>
							<thead>
								<tr>
									<th scope="col" class="column-rank">#</th>
									<th scope="col"><?php esc_html_e( 'Result', 'subsite-static-search' ); ?></th>
									<th scope="col"><?php esc_html_e( 'Type', 'subsite-static-search' ); ?></th>
									<th scope="col"><?php esc_html_e( 'Matched in', 'subsite-static-search' ); ?></th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
						<p class="description"><?php esc_html_e( 'Uses the index as last built. Ranking changes show here at once, before you save; changes to what is indexed (post types, fields) show after you save.', 'subsite-static-search' ); ?></p>
					</div>
				</td>
			</tr>
		</table>
		<?php
	}

	/**
	 * Items in rank order; items with the same rank keep their natural order.
	 *
	 * @param array<string,string> $items   Slug => label, in natural order.
	 * @param array<string,int>    $ranks   Slug => saved rank.
	 * @param int                  $default Rank for a slug with none saved.
	 * @return array<string,string>
	 */
	private static function by_rank( array $items, array $ranks, int $default ): array {
		$position = array_flip( array_map( 'strval', array_keys( $items ) ) );
		uksort(
			$items,
			static function ( $a, $b ) use ( $ranks, $default, $position ): int {
				return ( ( $ranks[ $a ] ?? $default ) <=> ( $ranks[ $b ] ?? $default ) ) ?: ( $position[ (string) $a ] <=> $position[ (string) $b ] );
			}
		);
		return $items;
	}

	/**
	 * A drag-and-drop list where the top row ranks first. Each row holds its rank number in a
	 * hidden input (that is what gets saved) and the script keeps the numbers in step with the
	 * order. A row whose rank equals the one above starts with "Same priority as above" ticked.
	 *
	 * @param string               $name    Field name prefix, e.g. static_search_settings[ranking].
	 * @param array<string,string> $items   Slug => label, in display order.
	 * @param array<string,int>    $ranks   Slug => saved rank.
	 * @param int                  $default Rank for a slug with none saved.
	 */
	private static function render_rank_list( string $name, array $items, array $ranks, int $default ): void {
		$previous = null;
		?>
		<div class="static-search-sortable">
			<ol class="static-search-sortable__list" role="list" data-rank-list>
				<?php foreach ( $items as $slug => $label ) : ?>
					<?php
					$rank     = (int) ( $ranks[ $slug ] ?? $default );
					$tied     = null !== $previous && $rank === $previous;
					$previous = $rank;
					?>
					<li class="static-search-sortable__item<?php echo $tied ? ' is-tied' : ''; ?>">
						<span class="static-search-sortable__handle" data-handle aria-hidden="true" title="<?php esc_attr_e( 'Drag to reorder', 'subsite-static-search' ); ?>"></span>
						<span class="static-search-sortable__label" data-rank-label><?php echo esc_html( $label ); ?></span>
						<label class="static-search-sortable__tie">
							<input type="checkbox" data-tie <?php checked( $tied ); ?>>
							<?php esc_html_e( 'Same priority as above', 'subsite-static-search' ); ?>
						</label>
						<span class="static-search-sortable__moves">
							<button type="button" class="button-link" data-move="up" aria-label="<?php /* translators: %s: item name */ echo esc_attr( sprintf( __( 'Move %s up', 'subsite-static-search' ), $label ) ); ?>"><span class="dashicons dashicons-arrow-up-alt2" aria-hidden="true"></span></button>
							<button type="button" class="button-link" data-move="down" aria-label="<?php /* translators: %s: item name */ echo esc_attr( sprintf( __( 'Move %s down', 'subsite-static-search' ), $label ) ); ?>"><span class="dashicons dashicons-arrow-down-alt2" aria-hidden="true"></span></button>
						</span>
						<input type="hidden" name="<?php echo esc_attr( $name . '[' . $slug . ']' ); ?>" value="<?php echo esc_attr( (string) $rank ); ?>" data-rank-value>
					</li>
				<?php endforeach; ?>
			</ol>
			<p class="screen-reader-text" role="status" aria-live="polite" data-rank-status></p>
		</div>
		<?php
	}

	/**
	 * A checkbox that submits 0 when unticked, so "off" is saved.
	 *
	 * @param string $name    Full field name.
	 * @param bool   $checked Current state.
	 * @param string $label   Label text.
	 */
	private static function checkbox( string $name, bool $checked, string $label ): void {
		?>
		<label>
			<input type="hidden" name="<?php echo esc_attr( $name ); ?>" value="0">
			<input type="checkbox" name="<?php echo esc_attr( $name ); ?>" value="1" <?php checked( $checked ); ?>>
			<?php echo esc_html( $label ); ?>
		</label>
		<?php
	}

	private static function render_excluded(): void {
		$query = new \WP_Query(
			array(
				'post_type'      => array_keys( Settings::available_post_types() ),
				'post_status'    => array( 'publish', 'draft', 'pending', 'private', 'future' ),
				'meta_key'       => Index::META_EXCLUDE, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => '1', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				'posts_per_page' => 200,
				'orderby'        => 'title',
				'order'          => 'ASC',
				'no_found_rows'  => true,
			)
		);
		?>
		<h2><?php esc_html_e( 'Hidden from search', 'subsite-static-search' ); ?></h2>
		<p class="description"><?php esc_html_e( 'To hide an item, tick “Hide this item from search” in the Static Search box on its edit screen.', 'subsite-static-search' ); ?></p>
		<?php if ( ! $query->have_posts() ) : ?>
			<p><?php esc_html_e( 'No items are hidden.', 'subsite-static-search' ); ?></p>
		<?php else : ?>
			<table class="widefat striped static-search-excluded" role="presentation">
				<tbody>
				<?php foreach ( $query->posts as $post ) : ?>
					<?php $object = get_post_type_object( $post->post_type ); ?>
					<tr>
						<td><a href="<?php echo esc_url( (string) get_edit_post_link( $post, 'raw' ) ); ?>"><?php echo esc_html( get_the_title( $post ) ); ?></a></td>
						<td><?php echo esc_html( $object ? $object->labels->singular_name : $post->post_type ); ?></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
		<?php
	}

	// Per-item exclude box --------------------------------------------------------------------

	public static function add_meta_box(): void {
		$types = array_values( array_intersect( array_keys( Settings::available_post_types() ), (array) Settings::get( 'post_types' ) ) );
		if ( $types ) {
			add_meta_box( 'static-search-exclude', __( 'Static Search', 'subsite-static-search' ), array( self::class, 'render_meta_box' ), $types, 'side', 'default' );
		}
	}

	/**
	 * @param \WP_Post $post Post being edited.
	 */
	public static function render_meta_box( \WP_Post $post ): void {
		wp_nonce_field( self::NONCE_META, 'static_search_meta_nonce' );
		?>
		<label>
			<input type="checkbox" name="static_search_exclude" value="1" <?php checked( Index::is_flagged( $post->ID ) ); ?>>
			<?php esc_html_e( 'Hide this item from search', 'subsite-static-search' ); ?>
		</label>
		<?php
	}

	/**
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post.
	 */
	public static function save_meta( int $post_id, \WP_Post $post ): void {
		if ( ! isset( $_POST['static_search_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['static_search_meta_nonce'] ) ), self::NONCE_META ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		if ( ! empty( $_POST['static_search_exclude'] ) ) {
			update_post_meta( $post_id, Index::META_EXCLUDE, '1' );
		} else {
			delete_post_meta( $post_id, Index::META_EXCLUDE );
		}
	}

	/**
	 * Label hidden items in the Posts / Pages / Products lists.
	 *
	 * @param array<string,string> $states Post states.
	 * @param \WP_Post             $post   Post.
	 * @return array<string,string>
	 */
	public static function post_states( array $states, \WP_Post $post ): array {
		if ( Index::is_flagged( $post->ID ) ) {
			$states['static_search_hidden'] = __( 'Hidden from search', 'subsite-static-search' );
		}
		return $states;
	}
}
