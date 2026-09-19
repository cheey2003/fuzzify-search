<?php
/**
 * Removes what Static Search stored: its settings, status, per-item flags and index file.
 *
 * The results page it created is left in place, since it is ordinary content the site may
 * link to. Delete it from Pages if you no longer want it.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Clean up one site.
 */
function static_search_uninstall_site(): void {
	delete_option( 'static_search_settings' );
	delete_option( 'static_search_status' );
	delete_option( 'static_search_dirty' );
	delete_post_meta_by_key( '_static_search_exclude' );
	wp_clear_scheduled_hook( 'static_search_rebuild' );

	$uploads = wp_upload_dir( null, false );
	$folder  = trailingslashit( $uploads['basedir'] ) . 'static-search';
	if ( is_dir( $folder ) ) {
		foreach ( (array) glob( $folder . '/*' ) as $file ) {
			if ( is_file( $file ) ) {
				wp_delete_file( $file );
			}
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
		@rmdir( $folder );
	}
}

if ( is_multisite() ) {
	$static_search_site_ids = get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	);
	foreach ( $static_search_site_ids as $static_search_site_id ) {
		switch_to_blog( (int) $static_search_site_id );
		static_search_uninstall_site();
		restore_current_blog();
	}
} else {
	static_search_uninstall_site();
}
