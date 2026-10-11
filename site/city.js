// The city — every fact that makes this calendar Everett's rather than
// another town's, in one place (2026-10-10, the rebase onto lqa-events). The
// browser (filter.js, app.js) and the build (scripts/*.mjs) both read it;
// nothing else names a venue or a team. The shared files (app.js, filter.js,
// styles.css bar its --v-* hues, scripts/*.mjs bar fetch-events.mjs and
// sources.mjs) are lqa-events' own, byte for byte — see README "Sister sites".
//
// Loaded before filter.js (a plain script, so the tests can share it): it
// sets globalThis.LQACity (the name is the shared code's, not the city's).
(function (global) {
  'use strict';

  // The home teams, matched on the event title whatever the venue. Order =
  // the Teams strip, left to right (Steve, 2026-10-10: "all three, no
  // seattle teams but add the locals"). Per team:
  //   re        the title match
  //   venue     the home building; schedule = the club's own schedule page
  //   sport     keys the strip icon (app.js SPORT_ICONS), the game clock,
  //             the leader categories
  //   colors    [primary, accent] — the season calendar's home cells and
  //             card frames
  //   name/abbr the club's full name and scoreboard abbreviation as its
  //             league lists them, for a first paint before teams.json
  //             arrives (the feed's own values take precedence)
  //   season    where the build reads the season schedule (schedules.mjs):
  //             none of these clubs is on ESPN, so each has its league's
  //             own feed — hockeytech (the WHL's stat feed, the one the
  //             PWHL also publishes through), mlb with sportId 13 (MLB's
  //             stats API covers the minors), digitalshift (Arena Football
  //             One's stats host); form the record/standing the same way
  //   inject    a club whose home games reach no ticket feed here: the
  //             league's schedule puts them in the listing, linked to the
  //             club's ticket page (fetch-events.mjs)
  //   strip     false = a filter row but no tab in the Teams view (no season
  //             feed to show there)
  //   club      the club's name on Ticketmaster; news the outlets' feeds;
  //             wiki the article (club: true — these clubs have no season
  //             pages on Wikipedia); opens when the season usually starts
  var HERALD = function (tag) { return ['https://www.heraldnet.com/tag/' + tag + '/feed/', 'The Herald']; };
  var ST = function (s) { return ['https://www.seattletimes.com/sports/' + s + '/feed/', 'Seattle Times']; }; // the Seattle clubs' beat
  var WHL = { league: 'whl', key: '41b145a848f4bd67' }; // HockeyTech's WHL feed, the key chl.ca's own pages carry
  var AF1 = 'f5e44156-da48-4879-8f21-202caf5584e5'; // DigitalShift's public client id for washingtonwolfpack.com
  var TEAMS = [
    // Everett Silvertips, WHL (since 2003), Angel of the Winds Arena
    { slug: 'silvertips', label: 'Silvertips', name: 'Everett Silvertips', abbr: 'EVT', re: /silvertips/i, sport: 'hockey', venue: 'Angel of the Winds Arena', colors: ['#004c3f', '#c3a24a'],
      season: { kind: 'hockeytech', league: WHL.league, key: WHL.key, id: 226, leagueName: 'WHL' }, form: { kind: 'hockeytech', league: WHL.league, key: WHL.key, id: 226 },
      logo: 'https://assets.leaguestat.com/whl/logos/226.png', schedule: 'https://everettsilvertips.com/schedule',
      club: 'Everett Silvertips', opens: 'late September', wiki: { title: 'Everett Silvertips', club: true },
      news: [HERALD('everett-silvertips')] },
    // Everett AquaSox, High-A Northwest League (Mariners affiliate), Funko Field at Everett Memorial Stadium
    { slug: 'aquasox', label: 'AquaSox', name: 'Everett AquaSox', abbr: 'EVE', re: /aquasox|aqua sox/i, sport: 'baseball', venue: 'Funko Field', colors: ['#0a2342', '#2fb5c7'],
      season: { kind: 'mlb', id: 403, sportId: 13 }, form: { kind: 'milb', id: 403, league: 126, leagueName: 'Northwest League' },
      inject: { url: 'https://www.milb.com/everett/tickets' }, // Ticketmaster lists the home stands without first-pitch times; the league's schedule supplies the rest
      logo: 'https://www.mlbstatic.com/team-logos/403.svg', schedule: 'https://www.milb.com/everett/schedule',
      club: 'Everett AquaSox', opens: 'early April', wiki: { title: 'Everett AquaSox', club: true },
      news: [['https://www.milb.com/everett/feeds/news/rss.xml', 'MiLB.com'], HERALD('everett-aquasox')] },
    // Washington Wolfpack, Arena Football One (indoor football, since 2024), Angel of the Winds Arena
    { slug: 'wolfpack', label: 'Wolfpack', name: 'Washington Wolfpack', abbr: 'WAS', re: /wolfpack/i, sport: 'football', venue: 'Angel of the Winds Arena', colors: ['#1b1b1b', '#b89b45'],
      season: { kind: 'digitalshift', service: AF1, id: 584641 }, form: { kind: 'digitalshift', service: AF1, id: 584641 },
      logo: 'https://digitalshift-stats.us-lax-1.linodeobjects.com/ad3317b4-081f-4c3b-a534-8691cef753c4/team-logo_url-584641-washington-wolfpack-1775199817575260960-medium.svg',
      schedule: 'https://www.washingtonwolfpack.com/stats#/1999/team-schedule?team_id=584641',
      club: 'Washington Wolfpack', opens: 'April', wiki: { title: 'Washington Wolfpack', club: true },
      news: [['https://www.washingtonwolfpack.com/news.rss', 'Washington Wolfpack']] },
    // Everett Community College Trojans, NWAC: the locals (Steve, 2026-10-10). Home games enter the
    // listing from the conference's calendar (fetch-events.mjs nwacTrojans); no season feed, so no tab.
    // The Seattle clubs Everett follows (Steve, 2026-10-11: "add kracken, the
    // rugby team then seahawks and mariners"): Teams view only — their home
    // grounds are not Everett venues, so no games enter the listing (no
    // `inject`; lqa-events lists the Seawolves' home matches that way). The
    // records are lqa-events' own, kept in step with its city.js.
    { slug: 'kraken', label: 'Kraken', re: /kraken/i, sport: 'hockey', venue: 'Climate Pledge Arena', colors: ['#001628', '#99d9d9'],
      espn: { sport: 'hockey', league: 'nhl', id: '124292' }, season: { kind: 'nhl', abbrev: 'SEA' }, form: { kind: 'espn' },
      logo: 'https://a.espncdn.com/i/teamlogos/nhl/500/sea.png', schedule: 'https://www.nhl.com/kraken/schedule',
      club: 'Seattle Kraken', opens: 'early October', wiki: { title: 'Seattle Kraken' },
      news: [ST('kraken'), ['https://soundofhockey.com/feed/', 'Sound Of Hockey'], ['https://www.davyjoneslockerroom.com/rss/current.xml', "Davy Jones' Locker Room"]],
      youtube: ['UCxspiBq2xf5pLjz9_NMjoyw'] }, // @seattlekraken (the NHL's clips come from api-web)
    { slug: 'seawolves', label: 'Seawolves', re: /seawolves/i, sport: 'rugby', venue: 'Starfire Stadium', colors: ['#003057', '#6cbe45'],
      season: { kind: 'seawolves' }, form: { kind: 'seawolves' },
      logo: 'https://www.seawolves.rugby/images/seawolves-logo.png', schedule: 'https://www.seawolves.rugby/schedule',
      club: 'Seattle Seawolves', opens: 'March', wiki: { title: 'Seattle Seawolves' },
      youtube: ['UCPcMc2KfvSO0YGfxzrbzy3w', 'UCIynwDVqRK7KTUy72_kSBhA'] }, // @seattleseawolvesrugby, @USMLR
    { slug: 'seahawks', label: 'Seahawks', re: /seahawks/i, sport: 'football', venue: 'Lumen Field', colors: ['#002244', '#69be28'],
      espn: { sport: 'football', league: 'nfl', id: '26' }, season: { kind: 'espn' }, form: { kind: 'espn' },
      logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png', schedule: 'https://www.seahawks.com/schedule/',
      club: 'Seattle Seahawks', opens: 'September', wiki: { title: 'Seattle Seahawks', startYear: true },
      news: [ST('seahawks'), ['https://www.seahawks.com/rss/news', 'Seahawks.com'], ['https://www.fieldgulls.com/rss/current.xml', 'Field Gulls']],
      youtube: ['UCzkFCRiMcOBeef8xcaqipmw', 'UCDVYQ4Zhbm3S2dlz7P1GBDg'] }, // @Seahawks, @NFL
    { slug: 'mariners', label: 'Mariners', re: /mariners/i, sport: 'baseball', venue: 'T-Mobile Park', colors: ['#0c2c56', '#005c5c'],
      espn: { sport: 'baseball', league: 'mlb', id: '12' }, season: { kind: 'mlb', id: 136 }, form: { kind: 'espn' },
      logo: 'https://a.espncdn.com/i/teamlogos/mlb/500/sea.png', schedule: 'https://www.mlb.com/mariners/schedule',
      club: 'Seattle Mariners', opens: 'late March', wiki: { title: 'Seattle Mariners' },
      division: ['HOU', 'LAA', 'ATH', 'TEX'], // AL West, by the abbreviations the schedule carries (ATH since the Athletics left Oakland)
      news: [ST('mariners'), ['https://www.mlb.com/mariners/feeds/news/rss.xml', 'MLB.com'], ['https://www.lookoutlanding.com/rss/current.xml', 'Lookout Landing']],
      youtube: ['UCWWLs-O8JGYYcNea7AgumAA'] }, // @mariners (MLB's clips come from statsapi)
    { slug: 'trojans', label: 'Trojans', name: 'Everett CC Trojans', re: /\btrojans\b/i, sport: 'basketball', venue: 'Everett Community College', colors: ['#b3202c', '#2b2b2b'],
      strip: false, schedule: 'https://athletics.everettcc.edu/', club: 'Everett Trojans' },
  ];

  // The venues, one record each — the big rooms first by size, then the
  // waterfront, the downtown nights and the campus. Per venue:
  //   capacity how many people the place holds
  //   type     the event type when the title decides nothing
  //   cssVar   the hue styles.css sets for it (dark block --v-*); color
  //            the same hue as a value, for the series graph
  //   url      the venue's own events listing — not a ticket vendor
  //   icon     a mark for listings without a team crest
  //   tm       its Ticketmaster Discovery listing (fetch-events.mjs reads
  //            the venue by id — every page; the city sweep covers the rest)
  //   alias    the other spellings the feeds use for it, folded to this name
  // No `area: 'town'` and no festivals: everything here is Everett's own,
  // so the panel's Around Town and Festivals groups fold away (app.js).
  var VENUES = {
    'Angel of the Winds Arena': {
      capacity: 10000,
      type: 'concert',
      cssVar: '--v-aotw',
      color: '#6aa9f0',
      url: 'https://www.angelofthewindsarena.com/events',
      icon: 'https://www.google.com/s2/favicons?domain=angelofthewindsarena.com&sz=128',
      tm: { id: 'KovZ917AhRn', match: 'angel of the winds', fallbackUrl: 'https://www.angelofthewindsarena.com/events', exclude: /parking/i },
      alias: /angel of the winds/i,
    },
    'Funko Field': {
      capacity: 3682,
      type: 'sports',
      cssVar: '--v-funko',
      color: '#5fcbd6',
      url: 'https://www.milb.com/everett/schedule',
      icon: 'https://www.google.com/s2/favicons?domain=www.milb.com&sz=128',
      alias: /funko field|everett memorial stadium/i,
    },
    'APEX Everett': {
      capacity: 700,
      type: 'concert',
      cssVar: '--v-apex',
      color: '#b58cf2',
      url: 'https://apexeverett.com/',
      icon: 'https://www.google.com/s2/favicons?domain=apexeverett.com&sz=128',
      tm: { id: 'KovZ917Am28', match: 'apex', fallbackUrl: 'https://apexeverett.com/' },
      alias: /^(?!.*\bel sid\b).*(?:apex everett|kings hall)/i,
    },
    'Port of Everett': {
      type: 'community',
      cssVar: '--v-port',
      color: '#5fb3a1',
      url: 'https://www.portofeverett.com/calendar.php',
      icon: 'https://www.google.com/s2/favicons?domain=www.portofeverett.com&sz=128',
    },
    'Village Theatre': {
      capacity: 514,
      type: 'arts',
      cssVar: '--v-village',
      color: '#f0827a',
      url: 'https://villagetheatre.org/mainstage/plan-your-visit/everett/',
      icon: 'https://www.google.com/s2/favicons?domain=villagetheatre.org&sz=128',
      alias: /village theat(?:re|er)/i,
    },
    'New Life Church': {
      type: 'concert',
      cssVar: '--v-newlife',
      color: '#c4a0f0',
      alias: /new life (?:church|center)/i,
    },
    'Everett Community College': {
      type: 'sports',
      cssVar: '--v-evcc',
      color: '#f08a8a',
      url: 'https://athletics.everettcc.edu/',
      icon: 'https://www.google.com/s2/favicons?domain=athletics.everettcc.edu&sz=128',
    },
    'Elsewhere in Everett': { // every room the feeds name that has no row of its own (a cafe show on EMI, a one-off hall in the Ticketmaster sweep) folds here — one row, not one per room (Steve, 2026-10-10)
      type: 'concert', // the feeds that name such rooms are the music calendars
      cssVar: '--v-else',
      color: '#9fb0c0',
    },
    'El Sid': { // the bar's own room at APEX: open mic, karaoke, blues and trivia nights (Late Shift Everett lists them)
      type: 'bar',
      cssVar: '--v-elsid',
      color: '#e8c45a',
      alias: /el sid/i,
    },
    'Lucky Dime': {
      type: 'bar',
      cssVar: '--v-dime',
      color: '#e8a35a',
      alias: /lucky dime/i,
    },
  };

  // The usual view: every room on, the two bars' weekly nights off (they
  // would crowd the list the way the SIFF showings did in Lower Queen Anne).
  var DEFAULT_ON = ['Angel of the Winds Arena', 'Funko Field', 'APEX Everett', 'Port of Everett', 'Village Theatre', 'New Life Church', 'Everett Community College', 'Elsewhere in Everett'];
  var DEFAULT_OFF = ['El Sid', 'Lucky Dime'];
  // the first default-off venue saved prefs had to be told about (prefs
  // record `known` from the first build of this site)
  var PREFS_KNOWN_FROM = 'El Sid';

  // Event types: every event lands in exactly one, from its flags, title,
  // then venue. The rows the panel shows, in order.
  var TYPES = [
    { key: 'concert', label: 'Concerts', title: 'Live music — arena tours to Kings Hall shows' },
    { key: 'sports', label: 'Sports', title: 'Silvertips, AquaSox, Wolfpack and Trojans home games' },
    { key: 'arts', label: 'Arts & Theater', title: 'Village Theatre runs, comedy, dance' },
    { key: 'community', label: 'Community', title: 'The waterfront season — Jetty Island Days, Music at the Marina, Sail-In Cinema, markets' },
    { key: 'bar', label: 'Neighborhood', title: 'Open mic, karaoke, trivia and live nights at the downtown bars — El Sid and Lucky Dime' },
  ];
  var MOVIE_VENUE = null; // no cinema here

  // Share codes (?f=CODE): REGISTRY is every filterable key in a fixed
  // order and a code is a bitmask over it, so the list is APPEND-ONLY —
  // adding an entry adds a bit and every existing code keeps meaning what
  // it meant; removing or reordering one changes every link out there.
  // Six base-36 digits hold 31 bits; 27 are used (five held 25 until the
  // Seattle clubs arrived on 2026-10-11 — codes from that first day read fine,
  // a shorter code is just a smaller number).
  var CODE_LENGTH = 6;
  var REGISTRY = [
    ['venue', 'Angel of the Winds Arena'], ['venue', 'Funko Field'], ['venue', 'APEX Everett'], ['venue', 'Port of Everett'],
    ['venue', 'Village Theatre'], ['venue', 'New Life Church'], ['venue', 'Everett Community College'], ['venue', 'El Sid'], ['venue', 'Lucky Dime'],
    ['badge', 'concert'], ['badge', 'sports'], ['badge', 'arts'], ['badge', 'community'], ['badge', 'bar'],
    ['team', 'silvertips'], ['team', 'aquasox'], ['team', 'wolfpack'], ['team', 'trojans'],
    ['cap', 'stadium'], ['cap', 'arena'], ['cap', 'hall'], ['cap', 'room'],
    ['venue', 'Elsewhere in Everett'], // appended 2026-10-10
    ['team', 'kraken'], ['team', 'seawolves'], ['team', 'seahawks'], ['team', 'mariners'], // appended 2026-10-11
  ];

  // The words the page uses for the place
  var WORDS = {
    teamCity: 'Everett', // the board drops it from the clubs' names ("Everett Silvertips" → Silvertips)
    presetDefault: 'Every room in town — the arena, Funko Field, APEX, the waterfront — every team and type; the bars’ weekly nights off',
    presetNeighborhood: 'Just Everett',
    presetBig: 'Only the places that hold 2,000 or more — the arena and the ballpark',
    phrases: { all: 'Showing everything.', none: 'Showing nothing yet — open Filter and pick some venues.', neighborhood: 'Showing the neighborhood only.', big: 'Showing the big rooms only — the arena and the ballpark.' },
  };

  global.LQACity = {
    key: 'everett',
    name: 'Everett',
    site: 'https://everett.here.events/',
    userAgent: 'Mozilla/5.0 (compatible; everett-events/1.0; +https://everett.here.events/)',
    // the calendar feed's header; the UID domain never changes (changing it
    // re-creates every event in subscribers' calendars — the UIDs are the
    // ones the first site issued)
    ics: { name: 'Everett Events', short: 'Everett Events', teams: 'Everett home teams — every season', prodid: '-//fosdal.net//everett-events//EN', uidDomain: 'fosdal.net',
      desc: 'Upcoming events around Everett\\, WA — Angel of the Winds Arena\\, Funko Field\\, APEX Everett\\, the waterfront' },
    teams: TEAMS,
    venues: VENUES,
    defaultOn: DEFAULT_ON,
    defaultOff: DEFAULT_OFF,
    prefsKnownFrom: PREFS_KNOWN_FROM,
    types: TYPES,
    movieVenue: MOVIE_VENUE,
    groundsVenue: 'Elsewhere in Everett', // a venue with no row of its own folds here (aliases are tried first)
    codeLength: CODE_LENGTH,
    registry: REGISTRY,
    words: WORDS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
