<?php
/**
 * WP-CLI commands.
 *
 * @package SubsiteStaticSearch
 */

declare( strict_types = 1 );

namespace SubsiteStaticSearch;

defined( 'ABSPATH' ) || exit;

/**
 * Manage the Fuzzify Search index.
 */
final class Cli {

	public static function register(): void {
		\WP_CLI::add_command( 'static-search', self::class );
	}

	/**
	 * Rebuild the search index file.
	 *
	 * Run this as a step before an export if you build the static site from the command line.
	 *
	 * ## EXAMPLES
	 *
	 *     wp static-search rebuild
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string,string> $assoc_args Named arguments.
	 */
	public function rebuild( $args, $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- WP-CLI passes both arguments to every command.
		$result = Index::build();
		if ( is_wp_error( $result ) ) {
			\WP_CLI::error( $result->get_error_message() );
		}
		\WP_CLI::success(
			sprintf(
				'Indexed %d items (%s, about %s compressed) at %s',
				$result['count'],
				size_format( $result['bytes'] ),
				size_format( max( 1, $result['gzip'] ) ),
				Index::relative( Index::absolute_url() )
			)
		);
	}

	/**
	 * Show what the last build produced.
	 *
	 * ## EXAMPLES
	 *
	 *     wp static-search status
	 *
	 * @param string[]             $args       Positional arguments.
	 * @param array<string,string> $assoc_args Named arguments.
	 */
	public function status( $args, $assoc_args ): void { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter -- WP-CLI passes both arguments to every command.
		$status = Index::status();
		\WP_CLI::log( 'File:      ' . Index::path() . ( Index::exists() ? '' : ' (missing)' ) );
		\WP_CLI::log( 'Items:     ' . $status['count'] );
		\WP_CLI::log( 'Size:      ' . size_format( $status['bytes'] ) . ' (about ' . size_format( max( 1, $status['gzip'] ) ) . ' compressed)' );
		\WP_CLI::log( 'Built:     ' . ( $status['generated'] ? gmdate( 'Y-m-d H:i:s', $status['generated'] ) . ' UTC' : 'never' ) );
		\WP_CLI::log( 'Changed since build: ' . ( (int) get_option( Sync::DIRTY_OPTION, 0 ) > $status['generated'] ? 'yes' : 'no' ) );
		if ( '' !== $status['error'] ) {
			\WP_CLI::warning( 'Last error: ' . $status['error'] );
		}
	}
}
