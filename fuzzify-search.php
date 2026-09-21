<?php
/**
 * Plugin Name:       Fuzzify Search
 * Description:       Instant, typo-tolerant search that runs in the visitor's browser. Works on the live WordPress site and in static HTML exports, with no server call at search time.
 * Version:           0.3.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Tangency
 * Author URI:        https://tangency.co
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       fuzzify-search
 * Troy:              https://node.subsite.dev
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

define( 'STATIC_SEARCH_VERSION', '0.3.0' );
define( 'STATIC_SEARCH_FILE', __FILE__ );
define( 'STATIC_SEARCH_DIR', plugin_dir_path( __FILE__ ) );
define( 'STATIC_SEARCH_URL', plugin_dir_url( __FILE__ ) );

require_once STATIC_SEARCH_DIR . 'includes/Settings.php';
require_once STATIC_SEARCH_DIR . 'includes/Index.php';
require_once STATIC_SEARCH_DIR . 'includes/Sync.php';
require_once STATIC_SEARCH_DIR . 'includes/Installer.php';
require_once STATIC_SEARCH_DIR . 'includes/Admin.php';
require_once STATIC_SEARCH_DIR . 'includes/Frontend.php';
require_once STATIC_SEARCH_DIR . 'includes/Cli.php';

register_activation_hook( __FILE__, array( Installer::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( Installer::class, 'deactivate' ) );

Sync::init();
Admin::init();
Frontend::init();

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	Cli::register();
}
