<?php
/**
 * Smoke test for the admin side, run against the current site:
 *
 *     wp eval-file wp-content/plugins/subsite-static-search/tests/admin-smoke.php
 *
 * Renders the settings screen as an administrator, feeds the sanitiser bad input, and checks the
 * per-item exclude box's nonce and permission rules on a temporary post. Changes nothing lasting.
 *
 * @package SubsiteStaticSearch
 */

use SubsiteStaticSearch\Admin;
use SubsiteStaticSearch\Index;
use SubsiteStaticSearch\Settings;

if ( ! class_exists( Settings::class ) ) {
	require_once dirname( __DIR__ ) . '/subsite-static-search.php';
}

$failures = 0;
$check    = static function ( bool $ok, string $label ) use ( &$failures ): void {
	echo ( $ok ? '  ok    ' : '  FAIL  ' ) . $label . "\n";
	if ( ! $ok ) {
		++$failures;
	}
};

echo "Settings screen\n";
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
wp_set_current_user( (int) $admins[0] );
set_current_screen( 'settings_page_static-search' );

$problems = array();
set_error_handler( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.prevent_path_disclosure_error_reporting
	static function ( int $no, string $str, string $file, int $line ) use ( &$problems ): bool {
		$problems[] = "$str ($file:$line)";
		return true;
	}
);
ob_start();
Admin::render();
$html = (string) ob_get_clean();
restore_error_handler();

$check( ! $problems, 'renders with no PHP warnings or notices' . ( $problems ? ': ' . $problems[0] : '' ) );
$check( false !== strpos( $html, 'Rebuild index now' ), 'has the rebuild button' );
$check( false !== strpos( $html, 'name="static_search_settings[post_types][]"' ), 'lists post types' );
$check( 1 === preg_match( '/name=[\'"]option_page[\'"] value=[\'"]static_search[\'"]/', $html ), 'posts through the Settings API' );
$check( 1 === preg_match( '/name=[\'"]static_search_settings\[results_page\][\'"]/', $html ), 'has the results page picker' );
$check( 0 === preg_match( '/<script/i', $html ), 'outputs no inline script' );
$check( false !== strpos( $html, 'Result ranking' ) && false !== strpos( $html, 'name="static_search_settings[ranking][title]"' ), 'has the field priority controls' );
$check( false !== strpos( $html, 'name="static_search_settings[type_priority][' ) && false !== strpos( $html, 'name="static_search_settings[type_mode]"' ), 'has the post type priority controls' );
$check( false !== strpos( $html, 'data-preview-input' ), 'has the "Try it" box' );
$check( false !== strpos( $html, 'name="static_search_settings[forward_old_search]"' ), 'has the old search address option' );
$check( false !== strpos( $html, 'name="static_search_settings[highlight]"' ) && false !== strpos( $html, 'name="static_search_settings[snippets]"' ), 'has the highlight and snippet options' );
$check( false !== strpos( $html, 'name="static_search_settings[results_enabled]"' ) && 3 === substr_count( $html, 'data-results-dependent' ), 'has the Activate switch, and marks the three settings that depend on it' );
$check( substr_count( $html, 'data-rank-list' ) >= 2, 'field and post type priorities are drag-and-drop lists' );
$check( false !== strpos( $html, 'static-search-sortable__item is-tied' ), 'rows that share a rank start tied (Categories and SKU by default)' );
$check( false !== strpos( $html, 'data-move="up"' ) && false !== strpos( $html, 'Move Title up' ), 'every row has keyboard-friendly arrow buttons' );
$check( 0 === substr_count( $html, '<select name="static_search_settings[ranking]' ), 'the old priority drop-downs are gone' );
$check( 0 === substr_count( $html, 'data-rank-badge' ) && false !== strpos( $html, 'role="list"' ), 'no rank numbers are shown, and the list keeps its list role' );

// Each stylesheet and script is versioned by its own modified time, so a change to one always reaches browsers and CDNs.
SubsiteStaticSearch\Frontend::enqueue();
SubsiteStaticSearch\Admin::assets( 'settings_page_static-search' );
$version_of = static function ( string $handle, string $kind ): string {
	$registry = 'style' === $kind ? wp_styles() : wp_scripts();
	return (string) $registry->registered[ $handle ]->ver;
};
$expect = static function ( string $file ): string {
	return STATIC_SEARCH_VERSION . '.' . filemtime( STATIC_SEARCH_DIR . $file );
};
$check( $version_of( 'static-search-admin', 'style' ) === $expect( 'assets/css/admin.css' ), 'the settings stylesheet is versioned by its own file time' );
$check( $version_of( 'static-search', 'style' ) === $expect( 'assets/css/static-search.css' ), 'the visitor stylesheet is versioned by its own file time (not the script\'s)' );
$check( $version_of( 'static-search', 'script' ) === $expect( 'assets/js/static-search.js' ) && $version_of( 'static-search-admin', 'script' ) === $expect( 'assets/js/static-search-admin.js' ), 'the scripts are too' );

// Rows come out in saved rank order, with equal ranks tied.
$labels_in = static function ( array $ranking ): array {
	add_filter( 'pre_option_' . Settings::OPTION, static fn() => array( 'ranking' => $ranking ), 10, 0 );
	ob_start();
	Admin::render();
	$page = (string) ob_get_clean();
	remove_all_filters( 'pre_option_' . Settings::OPTION );
	preg_match_all( '/data-rank-label>([^<]+)</', $page, $found );
	return array( array_slice( $found[1], 0, 5 ), $page );
};
list( $rearranged, $rearranged_html ) = $labels_in( array( 'content' => 1, 'title' => 2, 'terms' => 3, 'sku' => 3, 'excerpt' => 4 ) );
$check( array( 'Body text', 'Title', 'Categories and tags', 'SKU', 'Excerpt' ) === $rearranged, 'the field list is shown in the saved order' );
$check( false !== strpos( $rearranged_html, 'is-tied' ), 'and equal saved ranks show as tied' );

echo "\nSanitiser\n";
$defaults = Settings::defaults();
$clean    = Settings::sanitize(
	array(
		'post_types'       => array( 'post', 'not_a_type', '<script>' ),
		'fields'           => array( 'content', 'evil' ),
		'content_limit'    => '-5',
		'min_chars'        => '99',
		'delay'            => 'abc',
		'max_results'      => '0',
		'threshold'        => '0.9',
		'results_page'     => (string) get_option( 'page_on_front' ),
		'results_per_page' => '1000',
		'show_thumbs'      => '0',
	)
);
$check( array( 'post' ) === $clean['post_types'], 'unknown post types are dropped' );
$check( array( 'content' ) === $clean['fields'], 'unknown fields are dropped' );
$check( 0 === $clean['content_limit'], 'negative content limit becomes 0' );
$check( 10 === $clean['min_chars'], 'min chars is capped at 10' );
$check( 0 === $clean['delay'], 'non-numeric delay becomes 0' );
$check( 1 === $clean['max_results'], 'max results has a floor of 1' );
$check( in_array( $clean['threshold'], Settings::THRESHOLDS, true ), 'an invalid typo tolerance is rejected' );
$check( 100 === $clean['results_per_page'], 'results per page is capped' );
$check( false === $clean['show_thumbs'], '"0" switches a checkbox off' );
$ranked = Settings::sanitize(
	array(
		'ranking'       => array( 'title' => '9', 'content' => '-3', 'sku' => 'x', 'bogus' => '2' ),
		'type_priority' => array( 'product' => '1', 'post' => '999', 'nope' => '3' ),
		'type_mode'     => 'first',
	)
);
$check( 5 === $ranked['ranking']['title'], 'a ranking priority is capped at 5' );
$check( 1 === $ranked['ranking']['content'], 'a negative ranking priority becomes 1' );
$check( 1 === $ranked['ranking']['sku'], 'a non-numeric ranking priority becomes 1' );
$check( ! isset( $ranked['ranking']['bogus'] ), 'unknown ranking fields are dropped' );
$check( Settings::stored()['ranking']['terms'] === $ranked['ranking']['terms'], 'ranking fields not submitted keep their value' );
$check( array( 'product' => 1, 'post' => 99 ) === $ranked['type_priority'], 'post type priorities are capped at 99 and unknown types dropped' );
$check( 'first' === $ranked['type_mode'] && 'tie' === Settings::sanitize( array( 'type_mode' => 'sideways' ) )['type_mode'], 'post type mode accepts only tie or first' );

// A stored partial ranking list keeps the defaults for the fields it does not mention.
add_filter( 'pre_option_' . Settings::OPTION, static fn() => array( 'ranking' => array( 'title' => 3 ) ), 10, 0 );
$merged = Settings::stored()['ranking'];
remove_all_filters( 'pre_option_' . Settings::OPTION );
$check( 3 === $merged['title'] && Settings::defaults()['ranking']['content'] === $merged['content'], 'a partial stored ranking keeps the other defaults' );

$config = SubsiteStaticSearch\Frontend::config();
$check( isset( $config['rank']['title'], $config['typeMode'] ) && is_array( $config['typeRank'] ) && in_array( 'title', $config['fields'], true ), 'the script receives the ranking settings' );
$preview = Admin::preview_config();
$check( isset( $preview['indexUrl'], $preview['labels']['terms'], $preview['i18n']['showing'], $preview['i18n']['moved'] ), 'the settings script receives its text' );

// Highlighting and text snippets: on by default, switched off one at a time, and passed to the script.
$check( true === Settings::defaults()['highlight'] && true === Settings::defaults()['snippets'], 'highlighting and snippets are on by default' );
add_filter( 'pre_option_' . Settings::OPTION, static fn() => array(), 10, 0 );
$one_off  = Settings::sanitize( array( 'highlight' => '0' ) );
$both_off = Settings::sanitize( array( 'highlight' => '0', 'snippets' => '0' ) );
$both_on  = Settings::sanitize( array( 'highlight' => '1', 'snippets' => '1' ) );
remove_all_filters( 'pre_option_' . Settings::OPTION );
$check( false === $one_off['highlight'] && true === $one_off['snippets'], 'switching highlighting off leaves the snippet on' );
$check( false === $both_off['highlight'] && false === $both_off['snippets'], 'both can be switched off' );
$check( true === $both_on['highlight'] && true === $both_on['snippets'], 'and back on' );
$force = static fn( array $settings ): array => array_merge( $settings, array( 'highlight' => false, 'snippets' => false ) );
add_filter( 'static_search_settings', $force );
$forced = SubsiteStaticSearch\Frontend::config();
remove_filter( 'static_search_settings', $force );
$check( false === $forced['highlight'] && false === $forced['snippets'], 'the script is told when they are off' );
$check( is_bool( $config['highlight'] ) && is_bool( $config['snippets'] ), 'and gets both values otherwise' );

// Highlight colour: a WordPress colour picker field, saved only as a hex colour, printed only when it is not the default.
$check( 1 === preg_match( '/name=["\']static_search_settings\[highlight_color\]["\'][^>]*data-default-color=["\']#1a7f37["\']/', $html ), 'has the highlight colour field, with the default for the picker\'s Default button' );
Admin::assets( 'settings_page_static-search' );
$check( wp_script_is( 'wp-color-picker', 'enqueued' ) && wp_style_is( 'wp-color-picker', 'enqueued' ), "the settings screen loads WordPress' colour picker" );
$check( in_array( 'wp-color-picker', (array) wp_scripts()->registered['static-search-admin']->deps, true ), 'and the settings script waits for it' );
$check( '#1a7f37' === Settings::defaults()['highlight_color'], 'the default colour is the green in the stylesheet' );

add_filter( 'pre_option_' . Settings::OPTION, static fn() => array( 'highlight_color' => '#123456' ), 10, 0 );
$colours = array(
	array( '#FF5500', '#ff5500' ),
	array( 'ff5500', '#ff5500' ),
	array( '#abc', '#abc' ),
	array( '  #00AAFF ', '#00aaff' ),
	array( '', Settings::HIGHLIGHT_COLOR ),
	array( 'red', '#123456' ),
	array( '#12', '#123456' ),
	array( '#gggggg', '#123456' ),
	array( 'rgb(1,2,3)', '#123456' ),
	array( '#fff;}body{display:none}', '#123456' ),
	array( 'javascript:alert(1)', '#123456' ),
	array( array( '#fff' ), '#123456' ),
);
$bad_colours = array();
foreach ( $colours as $pair ) {
	$got = Settings::sanitize( array( 'highlight_color' => $pair[0] ) )['highlight_color'];
	if ( $pair[1] !== $got ) {
		$bad_colours[] = wp_json_encode( $pair[0] ) . ' gave ' . wp_json_encode( $got );
	}
}
$kept = Settings::sanitize( array( 'delay' => '50' ) )['highlight_color'];
remove_all_filters( 'pre_option_' . Settings::OPTION );
$check( ! $bad_colours, 'the colour is saved as a lower-case hex colour, empty means the default, anything else keeps the current one' . ( $bad_colours ? ': ' . $bad_colours[0] : '' ) );
$check( '#123456' === $kept, 'a save that does not mention the colour keeps it' );

$colour_with = static function ( array $extra ): string {
	$force = static fn( array $settings ): array => array_merge( $settings, $extra );
	add_filter( 'static_search_settings', $force );
	$colour = SubsiteStaticSearch\Frontend::highlight_color();
	remove_filter( 'static_search_settings', $force );
	return $colour;
};
$check( '' === $colour_with( array( 'highlight' => true, 'highlight_color' => '#1a7f37' ) ), 'the default colour prints nothing, so dark schemes keep their lighter green' );
$check( '#ff5500' === $colour_with( array( 'highlight' => true, 'highlight_color' => '#FF5500' ) ), 'a chosen colour is printed' );
$check( '' === $colour_with( array( 'highlight' => false, 'highlight_color' => '#ff5500' ) ), 'and not when highlighting is off' );
$hostile = array( '#fff;}body{display:none}', 'javascript:alert(1)', 'red', '</style><script>alert(1)</script>', 'url(//evil.test/x)', 12345, array( '#fff' ), null );
$leaks   = array_filter( $hostile, static fn( $value ): bool => '' !== $colour_with( array( 'highlight' => true, 'highlight_color' => $value ) ) );
$check( ! $leaks, 'whatever a filter puts in the setting, only a hex colour reaches the page' );

$printed = static function ( array $extra ): string {
	$force = static fn( array $settings ): array => array_merge( $settings, $extra );
	add_filter( 'static_search_settings', $force );
	wp_dequeue_style( 'static-search' );
	wp_deregister_style( 'static-search' );
	SubsiteStaticSearch\Frontend::enqueue();
	$after = wp_styles()->get_data( 'static-search', 'after' );
	remove_filter( 'static_search_settings', $force );
	wp_dequeue_style( 'static-search' );
	wp_deregister_style( 'static-search' );
	return is_array( $after ) ? implode( '', $after ) : '';
};
$check( false !== strpos( $printed( array( 'highlight' => true, 'highlight_color' => '#ff5500' ) ), ':root,[data-scheme="dark"]{--static-search-mark:#ff5500}' ), 'the page gets one rule for the light and dark schemes' );
$check( '' === $printed( array( 'highlight' => true, 'highlight_color' => '#1a7f37' ) ), 'and no rule at all for the default' );

$many_types = Settings::sanitize( array( 'type_priority' => array( 'product' => '50' ) ) );
$check( 50 === $many_types['type_priority']['product'], 'post type priority allows a long list of types' );

$check( true === Settings::defaults()['forward_old_search'], 'forwarding old search addresses is on by default' );
$check( false === Settings::sanitize( array( 'forward_old_search' => '0' ) )['forward_old_search'] && true === Settings::sanitize( array( 'forward_old_search' => '1' ) )['forward_old_search'], 'the old search address option saves on and off' );

// The forwarding script in the page head.
$head = static function (): string {
	ob_start();
	SubsiteStaticSearch\Frontend::forward_old_searches();
	return (string) ob_get_clean();
};
unset( $GLOBALS['current_screen'] ); // Back to the front end: rendering the settings page above set an admin screen.
// These checks are about a site with the results page switched on, whatever this site has saved.
add_filter( 'static_search_settings', $force_on = static function ( array $settings ): array {
	$settings['results_enabled'] = true;
	return $settings;
} );
$normal = $head();
$check( false !== strpos( $normal, 'id="static-search-forward"' ) && false !== strpos( $normal, 'StaticSearchForward="\\/search\\/"' ), 'a normal page gets the forwarding script, with the results page address' );
$check( strlen( $normal ) < 700, 'and it is small (' . strlen( $normal ) . ' bytes)' );
$GLOBALS['wp_query']->is_search = true;
$check( '' === $head(), 'a page WordPress renders as search results does not (its own results page is left alone)' );
$GLOBALS['wp_query']->is_search = false;
add_filter( 'static_search_settings', $off = static function ( array $settings ): array {
	$settings['forward_old_search'] = false;
	return $settings;
} );
$check( '' === $head(), 'switching the option off removes it' );
remove_filter( 'static_search_settings', $off );
add_filter( 'static_search_settings', $none = static function ( array $settings ): array {
	$settings['results_page'] = 0;
	return $settings;
} );
$check( '' === $head(), 'and so does having no results page to forward to' );
remove_filter( 'static_search_settings', $none );
remove_filter( 'static_search_settings', $force_on );

$check( true === Settings::defaults()['results_enabled'], 'the results page is on by default' );
$check( false === Settings::sanitize( array( 'results_enabled' => '0' ) )['results_enabled'] && true === Settings::sanitize( array( 'results_enabled' => '1' ) )['results_enabled'], 'the Activate switch saves on and off' );

// What Enter does, as the script is told, and what turns off with it.
$with = static function ( array $override, callable $then ) {
	add_filter( 'pre_option_' . Settings::OPTION, $f = static fn() => $override, 10, 0 );
	$result = $then();
	remove_filter( 'pre_option_' . Settings::OPTION, $f, 10 );
	return $result;
};
$cfg_on = $with( array( 'results_enabled' => true, 'results_page' => (int) Settings::stored()['results_page'] ), array( SubsiteStaticSearch\Frontend::class, 'config' ) );
$check( 'results' === $cfg_on['enter'] && '/search/' === $cfg_on['resultsUrl'], 'switched on with a page: Enter goes to the results page' );
$cfg_off = $with( array( 'results_enabled' => false ), array( SubsiteStaticSearch\Frontend::class, 'config' ) );
$check( 'none' === $cfg_off['enter'] && '' === $cfg_off['resultsUrl'], 'switched off: Enter does nothing and there is no results address' );
$cfg_nopage = $with( array( 'results_page' => 0 ), array( SubsiteStaticSearch\Frontend::class, 'config' ) );
$check( 'native' === $cfg_nopage['enter'] && '' === $cfg_nopage['resultsUrl'], 'switched on but no page: Enter is left to the browser' );
$off_page = $with( array( 'results_enabled' => false, 'results_page' => 0 ), static function (): string {
	ob_start();
	Admin::render();
	return (string) ob_get_clean();
} );
$check( false === strpos( $off_page, 'No results page is set' ), 'with it switched off there is no "no results page" warning' );
$check( false !== strpos( $off_page, 'Off: pressing Enter does nothing' ), 'and the status table says it is off' );

$partial = Settings::sanitize( array( 'delay' => '50' ) );
$check( 50 === $partial['delay'] && $partial['min_chars'] === Settings::stored()['min_chars'], 'a partial update keeps every other setting' );

echo "\nPer-item exclude box\n";
// Before creating the temporary post: remember the dirty flag and stop it queueing a real rebuild.
$prev_dirty = get_option( SubsiteStaticSearch\Sync::DIRTY_OPTION, null );
add_filter(
	'static_search_settings',
	static function ( array $settings ): array {
		$settings['rebuild_on_save'] = false;
		return $settings;
	}
);
$post_id = wp_insert_post(
	array(
		'post_title'  => 'Static Search admin smoke test',
		'post_status' => 'publish',
	)
);
$post = get_post( $post_id );
try {
	$submit = static function ( array $data ) use ( $post_id, $post ): void {
		$_POST = $data;
		Admin::save_meta( $post_id, $post );
		$_POST = array();
	};
	$nonce = wp_create_nonce( 'static_search_exclude_meta' );

	$submit( array( 'static_search_exclude' => '1' ) );
	$check( ! Index::is_flagged( $post_id ), 'without a nonce nothing is saved' );

	$submit( array( 'static_search_meta_nonce' => 'bogus', 'static_search_exclude' => '1' ) );
	$check( ! Index::is_flagged( $post_id ), 'with a bad nonce nothing is saved' );

	$submit( array( 'static_search_meta_nonce' => $nonce, 'static_search_exclude' => '1' ) );
	$check( Index::is_flagged( $post_id ), 'with a valid nonce, ticking the box flags the item' );
	$check( isset( Admin::post_states( array(), $post )['static_search_hidden'] ), 'flagged items are labelled in the post lists' );

	wp_set_current_user( 0 );
	$submit( array( 'static_search_meta_nonce' => wp_create_nonce( 'static_search_exclude_meta' ), 'static_search_exclude' => '' ) );
	$check( Index::is_flagged( $post_id ), 'a logged-out request cannot change it' );

	wp_set_current_user( (int) $admins[0] );
	$submit( array( 'static_search_meta_nonce' => $nonce ) );
	$check( ! Index::is_flagged( $post_id ), 'unticking the box clears the flag' );
} finally {
	wp_delete_post( $post_id, true );
	$_POST = array();
	null === $prev_dirty ? delete_option( SubsiteStaticSearch\Sync::DIRTY_OPTION ) : update_option( SubsiteStaticSearch\Sync::DIRTY_OPTION, $prev_dirty, false );
}

echo "\n" . ( $failures ? "$failures FAILED" : 'All checks passed' ) . "\n";
exit( $failures ? 1 : 0 );
