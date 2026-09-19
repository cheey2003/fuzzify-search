<?php
/**
 * Smoke test for the index builder, run against the current site:
 *
 *     wp eval-file wp-content/plugins/subsite-static-search/tests/smoke.php
 *
 * Writes the index to a temporary folder (not the site's uploads) and checks its contents.
 * Creates and removes one temporary post to prove per-item exclusion. Leaves the site as found.
 *
 * @package SubsiteStaticSearch
 */

use SubsiteStaticSearch\Index;
use SubsiteStaticSearch\Settings;

if ( ! defined( 'ABSPATH' ) || ! class_exists( Index::class ) ) {
	// Not activated: load it for this run only.
	require_once dirname( __DIR__ ) . '/subsite-static-search.php';
}

$failures = 0;
$check    = static function ( bool $ok, string $label ) use ( &$failures ): void {
	echo ( $ok ? '  ok    ' : '  FAIL  ' ) . $label . "\n";
	if ( ! $ok ) {
		++$failures;
	}
};

// Remember the real status and dirty flag, and stop the temporary posts queueing a real rebuild.
$prev_status = get_option( Index::STATUS_OPTION, null );
$prev_dirty  = get_option( SubsiteStaticSearch\Sync::DIRTY_OPTION, null );
add_filter(
	'static_search_settings',
	static function ( array $settings ): array {
		$settings['rebuild_on_save'] = false;
		return $settings;
	}
);

// Send the index to a throwaway folder.
$sandbox = sys_get_temp_dir() . '/static-search-smoke-' . wp_generate_password( 6, false );
wp_mkdir_p( $sandbox );
add_filter(
	'upload_dir',
	static function ( array $dirs ) use ( $sandbox ): array {
		$dirs['basedir'] = $sandbox;
		return $dirs;
	}
);

echo "Index build\n";
$status = Index::build();
$check( ! is_wp_error( $status ), 'build succeeds' );
$check( Index::exists(), 'index file exists' );

$data  = json_decode( (string) file_get_contents( Index::path() ), true );
$items = $data['items'] ?? array();
$check( is_array( $data ) && (int) $data['v'] === Index::SCHEMA_VERSION, 'valid JSON with schema version' );
$check( count( $items ) === (int) $data['count'] && count( $items ) > 0, 'count matches items (' . count( $items ) . ')' );

$bad_urls = array_filter(
	$items,
	static function ( array $i ): bool {
		return 0 !== strpos( $i['url'], '/' ) || false !== strpos( $i['url'], '://' );
	}
);
$check( ! $bad_urls, 'every item URL is site-relative' );
$bad_thumbs = array_filter(
	$items,
	static function ( array $i ): bool {
		return isset( $i['thumb'] ) && false !== strpos( $i['thumb'], home_url() );
	}
);
$check( ! $bad_thumbs, 'thumbnail URLs carry no site host' );
$check( ! array_filter( $items, static fn( array $i ): bool => '' === trim( $i['title'] ) ), 'no empty titles' );
$check( ! array_filter( $items, static fn( array $i ): bool => isset( $i['content'] ) && false !== strpos( $i['content'], '<' ) ), 'content has no HTML tags' );
$check( ! array_filter( $items, static fn( array $i ): bool => false !== strpos( $i['title'], '&amp;' ) || false !== strpos( $i['title'], '&#' ) ), 'titles have no HTML entities' );

$allowed = Settings::get( 'post_types' );
$check( ! array_filter( $items, static fn( array $i ): bool => ! in_array( $i['pt'], $allowed, true ) ), 'only selected post types' );

$results_page = (int) Settings::get( 'results_page' );
$check( ! $results_page || ! array_filter( $items, static fn( array $i ): bool => $i['id'] === $results_page ), 'results page is not indexed' );

if ( function_exists( 'wc_get_page_id' ) && Settings::get( 'skip_woo_pages' ) ) {
	$woo = array_filter( array_map( 'wc_get_page_id', array( 'cart', 'checkout', 'myaccount' ) ), static fn( $id ): bool => $id > 0 );
	$check( ! array_filter( $items, static fn( array $i ): bool => in_array( $i['id'], $woo, true ) ), 'WooCommerce cart/checkout/account are skipped' );
}

echo "\nPer-item exclusion and protected posts\n";
$post_id = wp_insert_post(
	array(
		'post_title'   => 'Static Search smoke test zebrafish',
		'post_content' => 'Body text for the smoke test.',
		'post_status'  => 'publish',
		'post_type'    => 'post',
	)
);
$protected_id = wp_insert_post(
	array(
		'post_title'    => 'Static Search protected quokka',
		'post_content'  => 'Secret body text that must not be published.',
		'post_status'   => 'publish',
		'post_type'     => 'post',
		'post_password' => 'secret',
	)
);
try {
	Index::build();
	$titles = array_column( json_decode( (string) file_get_contents( Index::path() ), true )['items'], 'title', 'id' );
	$check( isset( $titles[ $post_id ] ), 'a new published post is indexed' );

	update_post_meta( $post_id, Index::META_EXCLUDE, '1' );
	Index::build();
	$titles = array_column( json_decode( (string) file_get_contents( Index::path() ), true )['items'], 'title', 'id' );
	$check( ! isset( $titles[ $post_id ] ), 'flagging it removes it from the index' );

	$by_id = array_column( json_decode( (string) file_get_contents( Index::path() ), true )['items'], null, 'id' );
	$check( isset( $by_id[ $protected_id ] ) && ! isset( $by_id[ $protected_id ]['content'] ), 'password-protected post: title only, no body' );
	$check( false === strpos( (string) file_get_contents( Index::path() ), 'Secret body text' ), 'protected body text is nowhere in the file' );
} finally {
	wp_delete_post( $post_id, true );
	wp_delete_post( $protected_id, true );
	foreach ( (array) glob( $sandbox . '/static-search/*' ) as $file ) {
		is_file( $file ) && unlink( $file );
	}
	@rmdir( $sandbox . '/static-search' );
	@rmdir( $sandbox );
	foreach ( array( Index::STATUS_OPTION => $prev_status, SubsiteStaticSearch\Sync::DIRTY_OPTION => $prev_dirty ) as $option => $previous ) {
		null === $previous ? delete_option( $option ) : update_option( $option, $previous, false );
	}
}

echo "\n" . ( $failures ? "$failures FAILED" : 'All checks passed' ) . "\n";
exit( $failures ? 1 : 0 );
