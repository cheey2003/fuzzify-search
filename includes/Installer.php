<?php
/**
 * Activation and deactivation.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

final class Installer {

	/** Create the results page if there is none, then build the first index. */
	public static function activate(): void {
		$settings = array_merge( Settings::defaults(), (array) get_option( Settings::OPTION, array() ) );
		$page_id  = (int) $settings['results_page'];

		if ( $page_id < 1 || 'page' !== get_post_type( $page_id ) || 'trash' === get_post_status( $page_id ) ) {
			$page_id = self::create_results_page();
			if ( $page_id ) {
				$settings['results_page'] = $page_id;
			}
		}

		update_option( Settings::OPTION, $settings );
		Index::build();
	}

	public static function deactivate(): void {
		wp_clear_scheduled_hook( Sync::CRON_HOOK );
	}

	/**
	 * The page the search form sends visitors to. It is an ordinary page, so a static export
	 * includes it like any other.
	 *
	 * @return int Page ID, or 0 on failure.
	 */
	private static function create_results_page(): int {
		$page_id = wp_insert_post(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_title'   => _x( 'Search', 'results page title', 'subsite-static-search' ),
				'post_name'    => 'search',
				'post_content' => '<!-- wp:shortcode -->[static_search_results]<!-- /wp:shortcode -->',
			),
			true
		);
		return is_wp_error( $page_id ) ? 0 : (int) $page_id;
	}
}
