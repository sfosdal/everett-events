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
  // Since 2026-10-11 `area: 'town'` marks the towns a short drive away
  // (the panel's Around Town group); no festivals yet. Before that everything here was Everett's own,
  // so the panel's Around Town and Festivals groups fold away (app.js).
  var VENUES = {
    'Angel of the Winds Arena': {
      geo: [47.9786, -122.20302],
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
      geo: [47.9669, -122.20256],
      capacity: 3682,
      type: 'sports',
      cssVar: '--v-funko',
      color: '#5fcbd6',
      url: 'https://www.milb.com/everett/schedule',
      icon: 'https://www.google.com/s2/favicons?domain=www.milb.com&sz=128',
      alias: /funko field|everett memorial stadium/i,
    },
    'APEX Everett': {
      geo: [47.98205, -122.20826],
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
      geo: [48.00142, -122.217],
      type: 'community',
      cssVar: '--v-port',
      color: '#5fb3a1',
      url: 'https://www.portofeverett.com/calendar.php',
      icon: 'https://www.google.com/s2/favicons?domain=www.portofeverett.com&sz=128',
    },
    'Village Theatre': {
      geo: [47.98154, -122.20759],
      capacity: 514,
      type: 'arts',
      cssVar: '--v-village',
      color: '#f0827a',
      url: 'https://villagetheatre.org/mainstage/plan-your-visit/everett/',
      icon: 'https://www.google.com/s2/favicons?domain=villagetheatre.org&sz=128',
      alias: /village theat(?:re|er)/i,
    },
    'Everett Community College': {
      geo: [48.00545, -122.19933],
      type: 'sports',
      cssVar: '--v-evcc',
      color: '#f08a8a',
      url: 'https://athletics.everettcc.edu/',
      icon: 'https://www.google.com/s2/favicons?domain=athletics.everettcc.edu&sz=128',
    },
    'Elsewhere in Everett': { // every room the feeds name that has no row of its own (a cafe show on EMI, a one-off hall in the Ticketmaster sweep) folds here — one row, not one per room (Steve, 2026-10-10)
      geo: [47.97815, -122.20763],
      type: 'concert', // the feeds that name such rooms are the music calendars
      cssVar: '--v-else',
      color: '#9fb0c0',
    },
    'El Sid': { // the bar's own room at APEX, 1611 Everett Ave (2nd floor): open mic, karaoke, blues and trivia nights (Late Shift Everett) and the El Sid Concert Series (Stranger Tickets sells it as "El Sid at the APEX") — one room, one row, merged by that address (Steve, 2026-10-20); the concert nights keep the Concerts type the feed gives them
      geo: [47.98205, -122.20826],
      type: 'bar',
      cssVar: '--v-elsid',
      color: '#e8c45a',
      url: 'https://www.strangertickets.com/events/venues/el-sid-at-the-apex',
      icon: 'https://www.google.com/s2/favicons?domain=apexeverett.com&sz=128',
      alias: /el sid/i,
    },
    'Lucky Dime': {
      geo: [47.97912, -122.20757],
      type: 'bar',
      cssVar: '--v-dime',
      color: '#e8a35a',
      alias: /lucky dime/i,
    },
    // --- 2026-10-11, "do everything under 20m": the rest of Everett and the
    //     towns a short drive away. The libraries, the Schack's classes and
    //     the Scuttlebutt's weekly nights are default-off (they would crowd
    //     the list the way the bars' nights would). ---
    'Schack Art Center': {
      geo: [47.97861, -122.20967],
      type: 'community',
      cssVar: '--v-schack',
      color: '#e8b36a',
      url: 'https://www.schack.org/classes-workshops-events',
      icon: 'https://www.google.com/s2/favicons?domain=www.schack.org&sz=128',
      alias: /schack/i,
    },
    'Everett Public Library': {
      geo: [47.98167, -122.21067],
      type: 'community',
      cssVar: '--v-epls',
      color: '#8fb9f0',
      url: 'https://www.epls.org/Calendar.aspx',
      icon: 'https://www.google.com/s2/favicons?domain=www.epls.org&sz=128',
      alias: /everett public library|\bepls\b/i,
    },
    'City of Everett': {
      geo: [47.97815, -122.20763],
      type: 'community',
      cssVar: '--v-city',
      color: '#7fcfa0',
      url: 'https://www.everettwa.gov/calendar.aspx',
      icon: 'https://www.google.com/s2/favicons?domain=www.everettwa.gov&sz=128',
    },
    'Scuttlebutt Brewing': {
      geo: [48.00077, -122.21735],
      type: 'bar',
      cssVar: '--v-scuttle',
      color: '#e8a35a',
      url: 'https://www.scuttlebuttbrewing.com/events',
      icon: 'https://www.google.com/s2/favicons?domain=www.scuttlebuttbrewing.com&sz=128',
      alias: /scuttlebutt/i,
    },
    'Historic Everett Theatre': {
      geo: [47.97876, -122.20837],
      capacity: 800,
      type: 'concert',
      cssVar: '--v-het',
      color: '#f0a0b8',
      url: 'https://www.songkick.com/venues/823286-historic-everett-theatre', // the theatre's own site is down (2026-10-11); point back at it when it returns
      alias: /historic everett theat/i,
    },
    'Tulalip Resort Casino': {
      geo: [48.08816, -122.19004],
      area: 'town',
      type: 'concert',
      cssVar: '--v-tulalip',
      color: '#d9a05b',
      url: 'https://www.everythingtulalip.com/entertainment/calendar/',
      icon: 'https://www.google.com/s2/favicons?domain=www.everythingtulalip.com&sz=128',
      tm: { id: 'KovZpa3pFe', match: 'tulalip', fallbackUrl: 'https://www.everythingtulalip.com/entertainment/calendar/' },
      alias: /tulalip (?:resort|amphitheat|casino)/i,
    },
    'Edmonds Center for the Arts': {
      geo: [47.81426, -122.37575],
      area: 'town',
      capacity: 700,
      type: 'arts',
      cssVar: '--v-eca',
      color: '#c8a0f0',
      url: 'https://www.edmondscenterforthearts.org/events/',
      icon: 'https://www.google.com/s2/favicons?domain=www.edmondscenterforthearts.org&sz=128',
      tm: { id: 'KovZpZAFF7IA', match: 'edmonds center', fallbackUrl: 'https://www.edmondscenterforthearts.org/events/' },
      alias: /edmonds center for the arts/i,
    },
    'Sno-Isle Libraries': {
      geo: [48.06356, -122.14779],
      area: 'town',
      type: 'community',
      cssVar: '--v-snoisle',
      color: '#9fd0e8',
      url: 'https://sno-isle.bibliocommons.com/v2/events',
      icon: 'https://www.google.com/s2/favicons?domain=www.sno-isle.org&sz=128',
      alias: /sno-isle/i,
    },
    'City of Marysville': {
      geo: [48.05412, -122.1792],
      area: 'town',
      type: 'community',
      cssVar: '--v-marysville',
      color: '#f0b0a0',
      url: 'https://www.marysvillewa.gov/calendar.aspx',
      icon: 'https://www.google.com/s2/favicons?domain=www.marysvillewa.gov&sz=128',
    },
    'City of Mukilteo': {
      geo: [47.88904, -122.28887],
      area: 'town',
      type: 'community',
      cssVar: '--v-mukilteo',
      color: '#a0d8d0',
      url: 'https://www.mukilteowa.gov/calendar.aspx',
      icon: 'https://www.google.com/s2/favicons?domain=www.mukilteowa.gov&sz=128',
    },
    'City of Snohomish': {
      geo: [47.91215, -122.09353],
      area: 'town',
      type: 'community',
      cssVar: '--v-snohomish',
      color: '#d8c8a0',
      url: 'https://www.snohomishwa.gov/calendar.aspx',
      icon: 'https://www.google.com/s2/favicons?domain=www.snohomishwa.gov&sz=128',
    },
    'Historic Downtown Snohomish': {
      geo: [47.9122, -122.0968],
      area: 'town',
      type: 'community',
      cssVar: '--v-hds',
      color: '#e8c0d8',
      url: 'https://www.historicdowntownsnohomish.org/calendar',
      icon: 'https://www.google.com/s2/favicons?domain=www.historicdowntownsnohomish.org&sz=128',
    },
    'City of Mill Creek': {
      geo: [47.855, -122.22199],
      area: 'town',
      type: 'community',
      cssVar: '--v-millcreek',
      color: '#b0d8a0',
      url: 'https://millcreekwa.gov/events',
      icon: 'https://www.google.com/s2/favicons?domain=millcreekwa.gov&sz=128',
    },
  };

  // The usual view: every room on, Lucky Dime's weekly nights off (they
  // would crowd the list the way the SIFF showings did in Lower Queen Anne).
  var DEFAULT_ON = ['Angel of the Winds Arena', 'Funko Field', 'APEX Everett', 'El Sid', 'Port of Everett', 'Village Theatre', 'Everett Community College', 'Elsewhere in Everett',
    'City of Everett', 'Historic Everett Theatre', 'Tulalip Resort Casino', 'Edmonds Center for the Arts', 'City of Marysville', 'City of Mukilteo', 'City of Snohomish', 'Historic Downtown Snohomish', 'City of Mill Creek']; // the 2026-10-11 round
  var DEFAULT_OFF = ['Lucky Dime', 'Schack Art Center', 'Everett Public Library', 'Sno-Isle Libraries', 'Scuttlebutt Brewing']; // the libraries' daily programs, the Schack's class sessions and the brewery's weekly nights are there for whoever wants them (2026-10-11)
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
  var CODE_LENGTH = 8; // 40 slots since 2026-10-11 (the under-20-minutes round); 6-digit codes from before still read
  var REGISTRY = [
    ['venue', 'Angel of the Winds Arena'], ['venue', 'Funko Field'], ['venue', 'APEX Everett'], ['venue', 'Port of Everett'],
    ['venue', 'Village Theatre'], ['venue', 'New Life Church'] /* dead slot: the venue left 2026-10-11 (church events are never listed); kept so older codes keep their meaning */, ['venue', 'Everett Community College'], ['venue', 'El Sid'], ['venue', 'Lucky Dime'],
    ['badge', 'concert'], ['badge', 'sports'], ['badge', 'arts'], ['badge', 'community'], ['badge', 'bar'],
    ['team', 'silvertips'], ['team', 'aquasox'], ['team', 'wolfpack'], ['team', 'trojans'],
    ['cap', 'stadium'], ['cap', 'arena'], ['cap', 'hall'], ['cap', 'room'],
    ['venue', 'Elsewhere in Everett'], // appended 2026-10-10
    ['team', 'kraken'], ['team', 'seawolves'], ['team', 'seahawks'], ['team', 'mariners'], // appended 2026-10-11
    ['venue', 'Schack Art Center'], ['venue', 'Everett Public Library'], ['venue', 'City of Everett'], ['venue', 'Scuttlebutt Brewing'], ['venue', 'Historic Everett Theatre'], // appended 2026-10-11, the under-20-minutes round
    ['venue', 'Tulalip Resort Casino'], ['venue', 'Edmonds Center for the Arts'], ['venue', 'Sno-Isle Libraries'], ['venue', 'City of Marysville'], ['venue', 'City of Mukilteo'], ['venue', 'City of Snohomish'], ['venue', 'Historic Downtown Snohomish'], ['venue', 'City of Mill Creek'],
    ['venue', 'El Sid at the APEX'], // appended 2026-10-19 (41 slots, still 8 digits); dead slot since 2026-10-20 (merged into El Sid), kept so older codes keep their meaning
  ];

  // The words the page uses for the place
  var WORDS = {
    teamCity: 'Everett', // the board drops it from the clubs' names ("Everett Silvertips" → Silvertips)
    presetDefault: 'Every venue in town — the arena, Funko Field, APEX, the waterfront — every team and type; Lucky Dime’s weekly nights off',
    presetNeighborhood: 'Just Everett',
    presetBig: 'Only the places that hold 2,000 or more — the arena and the ballpark',
    phrases: { all: 'Showing everything.', none: 'Showing nothing yet — open Filter and pick some venues.', neighborhood: 'Showing the neighborhood only.', big: 'Showing the big venues only — the arena and the ballpark.' },
  };

  global.LQACity = {
    key: 'everett',
    name: 'Everett',
    site: 'https://everett.here.events/',
    userAgent: 'Mozilla/5.0 (compatible; everett-events/1.0; +https://everett.here.events/)',
    tz: 'America/Los_Angeles', tzName: 'Pacific', // the city's time zone: the ICS feed's TZID, the game clocks, the poster's footer
    state: "Washington", stateOutline: 'M6.9 5.6L9.4 5.6L12.6 5.6L15.9 5.6L19.2 5.6L21.6 5.6L21.6 7.4L21.6 9.2L21.7 11.0L21.7 12.8L21.7 14.7L21.6 15.4L21.9 16.3L22.0 16.9L20.0 16.9L18.0 16.9L16.6 16.9L15.5 17.1L13.2 17.9L11.0 18.2L9.8 18.0L8.6 18.4L7.5 18.3L7.0 17.8L6.3 16.3L5.7 16.3L5.2 15.9L4.1 15.9L3.7 15.5L3.8 14.9L4.1 14.4L3.5 13.6L3.7 13.0L3.5 13.3L3.3 12.3L2.6 10.1L2.0 8.7L2.2 7.9L3.6 8.6L5.7 8.9L6.3 9.0L6.7 9.0L7.0 9.0L7.3 9.8L6.9 10.1L6.0 11.4L6.1 11.8L6.6 11.5L6.2 11.4L6.6 10.8L7.1 10.2L7.4 9.6L7.6 10.0L7.3 10.5L7.2 10.8L7.5 11.4L7.4 12.1L7.1 12.0L6.9 11.9L6.5 12.2L6.6 12.6L7.1 12.7L7.5 12.1L7.9 11.9L8.0 11.1L7.9 10.6L8.0 10.3L8.1 9.7L8.3 9.2L7.9 8.7L7.9 9.0L7.6 8.7L7.7 8.3L7.7 7.9L7.3 7.7L7.3 7.5L7.7 7.4L7.6 6.8L7.5 6.4L7.2 6.3Z', // the masthead's small state, linking to here.events (scripts/state-outline.mjs, Natural Earth 1:50m)
    // the calendar feed's header; the UID domain never changes (changing it
    // re-creates every event in subscribers' calendars — the UIDs are the
    // ones the first site issued)
    ics: { name: 'Everett Events', short: 'Everett Events', teams: 'Everett home teams — every season', prodid: '-//fosdal.net//everett-events//EN', uidDomain: 'fosdal.net',
      desc: 'Upcoming events around Everett\\, WA — Angel of the Winds Arena\\, Funko Field\\, APEX Everett\\, the waterfront' },
    teams: TEAMS,
    map: { // the Map view (local-map.js; the ground drawn once by scripts/build-local-map.mjs from OpenStreetMap, committed as site/local-map.json) — Steve, 2026-10-25
      kind: 'urban',
      bbox: [47.78, -122.45, 48.12, -122.02], // south, west, north, east — Everett and its neighbours — Edmonds at the foot, Tulalip and Lake Stevens at the top
      home: [47.955, -122.235, 48.015, -122.17], // the view at first; the fit button shows the whole frame
      roads: ['motorway', 'trunk', 'primary'],
      tolerance: 0.6,
      labels: [
        { name: 'Everett', lat: 47.9793, lon: -122.2127, anchor: 'end' },
        { name: 'Marysville', lat: 48.0517, lon: -122.1768, anchor: 'start' },
        { name: 'Tulalip', lat: 48.0656, lon: -122.2869, anchor: 'end' },
        { name: 'Mukilteo', lat: 47.9474, lon: -122.3037, anchor: 'end' },
        { name: 'Edmonds', lat: 47.8106, lon: -122.3775, anchor: 'end' },
        { name: 'Snohomish', lat: 47.9129, lon: -122.0982, anchor: 'start' },
        { name: 'Mill Creek', lat: 47.8577, lon: -122.2211, anchor: 'start' },
        { name: 'Lynnwood', lat: 47.8279, lon: -122.3054, anchor: 'start' },
        { name: 'Lake Stevens', lat: 48.0198, lon: -122.0661, anchor: 'start' },
        { name: 'Port Gardner Bay', lat: 47.995, lon: -122.245, kind: 'water', anchor: 'middle' },
        { name: 'Possession Sound', lat: 47.925, lon: -122.31, kind: 'water', anchor: 'middle' },
        { name: 'Snohomish River', lat: 48.03, lon: -122.17, kind: 'water', anchor: 'middle' },
      ],
    },
    venues: VENUES,
    defaultOn: DEFAULT_ON,
    defaultOff: DEFAULT_OFF,
    prefsKnownFrom: PREFS_KNOWN_FROM,
    types: TYPES,
    movieVenue: MOVIE_VENUE,
    // city-wide listings (scripts/feeds.mjs): Stranger Tickets read by the town in its Venue cell — its
    // city buttons file Everett under Seattle (Steve, 2026-10-19: "use the location here")
    feeds: [
      { kind: 'boldtype', label: 'Stranger Tickets', url: 'https://www.strangertickets.com', city: '', rooms: /\bEverett, WA\b/i, type: 'concert', drop: /season (?:tickets?|pass(?:es)?)|gift card/i },
    ],
    groundsVenue: 'Elsewhere in Everett', // a venue with no row of its own folds here (aliases are tried first)
    codeLength: CODE_LENGTH,
    registry: REGISTRY,
    words: WORDS,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
