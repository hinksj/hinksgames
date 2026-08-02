// COMMODORE CUP — card data. Canon: the printed cards (July 2024 print run).
// Art lives in assets/cards/. All 84 cards: 48 suit + 11 special + 25 member.
(function (G) {
  'use strict';

  var LETTERS = 'ABCDEFGHIJKL'.split('');

  var SUITS = {
    party:    { key: 'party',    label: 'Theme Parties', color: '#ff5fb2' },
    yacht:    { key: 'yacht',    label: 'Yachts',        color: '#f4f0ff' },
    cocktail: { key: 'cocktail', label: 'Cocktails',     color: '#ffd166' },
    cruise:   { key: 'cruise',   label: 'Cruise-Outs',   color: '#5fd6ff' }
  };

  var SUIT_NAMES = {
    party: ["Admiral's Ball", 'Bollywood Bash', 'Casino Night', 'Disco Dance-Off',
      'Epicurean Extravaganza', 'Fiesta Fundraiser', 'Gatsby Gala', 'Halloween Hoopla',
      'Ice Cream Social', 'Jazz Party', 'Karaoke Night', 'Luau Night'],
    yacht: ['Albatross', 'Barracuda', 'Clownfish', 'Dolphin', 'Egret', 'Flying Fish',
      'Grouper', 'Hermit Crab', 'Ibis', 'Jellyfish', 'Kraken', 'Lobster'],
    cocktail: ['Aperol Spritz', 'Bloody Mary', 'Caipirinha', "Dark 'n' Stormy",
      'Espresso Martini', 'French 75', 'Gin Fizz', 'Hot Toddy', 'Irish Coffee',
      'Jalapeño Margarita', 'Kentucky Mule', 'Lemon Drop'],
    cruise: ['Antigua', 'BVIs', 'Catalina Island', 'The Delta', 'Ensenada',
      'French Polynesia', 'Grand Cayman', 'Half Moon Bay', 'Isle of Wight',
      'Juan de Fuca', 'Key West', 'La Paz']
  };

  var SLUGS = {
    party: ['admirals-ball', 'bollywood-bash', 'casino-night', 'disco-dance-off',
      'epicurean-extravaganza', 'fiesta-fundraiser', 'gatsby-gala', 'halloween-hoopla',
      'ice-cream-social', 'jazz-party', 'karaoke-night', 'luau-night'],
    yacht: ['albatross', 'barracuda', 'clownfish', 'dolphin', 'egret', 'flying-fish',
      'grouper', 'hermit-crab', 'ibis', 'jellyfish', 'kraken', 'lobster'],
    cocktail: ['aperol-spritz', 'bloody-mary', 'caipirinha', 'dark-n-stormy',
      'espresso-martini', 'french-75', 'gin-fizz', 'hot-toddy', 'irish-coffee',
      'jalapeno-margarita', 'kentucky-mule', 'lemon-drop'],
    cruise: ['antigua', 'bvis', 'catalina-island', 'the-delta', 'ensenada',
      'french-polynesia', 'grand-cayman', 'half-moon-bay', 'isle-of-wight',
      'juan-de-fuca', 'key-west', 'la-paz']
  };

  // Special actions. `fx` is the machine-readable effect; text is as printed.
  var SPECIALS = [
    { id: 'party-foul', name: 'Party Foul', text: 'Discard one extra card.',
      clarify: 'You discard one extra card of your choice — as printed.',
      fx: { type: 'selfDiscard', n: 1 } },
    { id: 'smooth-talker', name: 'Smooth Talker', text: 'Draw 2 cards.',
      fx: { type: 'draw', n: 2 } },
    { id: 'reciprocity', name: 'Reciprocity',
      text: "Use club reciprocals to steal a card from another player's hand.",
      fx: { type: 'steal' } },
    { id: 'harbor-mixup', name: 'Harbor Mixup', text: 'Swap hands with another player.',
      fx: { type: 'swapHands' } },
    { id: 'fashion-statement', name: 'Fashion Statement', text: 'The next player must skip a turn.',
      fx: { type: 'skipNext' } },
    { id: 'member-discount', name: 'Member Discount', text: 'Take a card from the discard pile.',
      clarify: 'Any card in the pile, not just the top.',
      fx: { type: 'takeDiscard' } },
    { id: 'dockside-gossip', name: 'Dockside Gossip',
      text: 'Look at the top 3 cards of the draw pile and keep one, discard 2.',
      fx: { type: 'gossip' } },
    { id: 'private-party', name: 'Private Party', text: 'All players pass one card to their left.',
      fx: { type: 'passAll', dir: 1 } },
    { id: 'sunset-cruise', name: 'Sunset Cruise', text: 'All players pass one card to their right.',
      fx: { type: 'passAll', dir: -1 } },
    { id: 'favorable-winds', name: 'Favorable Winds', text: 'Draw 2 cards from the deck.',
      fx: { type: 'draw', n: 2 } },
    { id: 'against-the-current', name: 'Against the Current',
      text: 'Choose a player to draw 2 cards from the deck.',
      fx: { type: 'forceDraw', n: 2 } }
  ];

  // Members. `pts` counts at round end; `fx` resolves on courting. Text as printed.
  var MEMBERS = [
    { id: 'jet-ski-jerry', name: 'Jet Ski Jerry', pts: 5,
      text: "+5 points and look at another player's hand.", fx: { type: 'peek' } },
    { id: 'catamaran-carl', name: 'Catamaran Carl', pts: 5,
      text: 'Gain 5 points and draw an extra card.', fx: { type: 'draw', n: 1 } },
    { id: 'captain-charlie', name: 'Captain Charlie', pts: 8,
      text: '+8 points and choose an opponent to skip the next turn.', fx: { type: 'skipChoose' } },
    { id: 'breezy-brad', name: 'Breezy Brad', pts: -5,
      text: 'Lose 5 points and discard an extra card.', fx: { type: 'selfDiscard', n: 1 } },
    { id: 'regatta-rick', name: 'Regatta Rick', pts: -3,
      text: 'Lose 3 points and pass a card to the right.', fx: { type: 'give', dir: -1 } },
    { id: 'dockside-donna', name: 'Dockside Donna', pts: 6,
      text: 'Gain 6 points and draw an extra card.', fx: { type: 'draw', n: 1 } },
    { id: 'swanky-skip', name: 'Swanky Skip', pts: 5,
      text: 'Gain 5 points, and all players pass a card to the right.', fx: { type: 'passAll', dir: -1 } },
    { id: 'deckhand-dave', name: 'Deckhand Dave', pts: 6,
      text: 'Gain 6 points and steal a card from another player.', fx: { type: 'steal' } },
    { id: 'nautical-neil', name: 'Nautical Neil', pts: 3,
      text: 'Gain 3 points and the player to your left skips a turn.', fx: { type: 'skipNext' } },
    { id: 'podium-pete', name: 'Podium Pete', pts: 5,
      text: "Gain 5 points and look at another player's hand.", fx: { type: 'peek' } },
    { id: 'marina-mike', name: 'Marina Mike', pts: -6,
      text: 'Lose 6 points and draw an extra two cards.', fx: { type: 'draw', n: 2 } },
    { id: 'champagne-charlotte', name: 'Champagne Charlotte', pts: -2,
      text: '−2 points, and hand one card to an opponent.', fx: { type: 'give', dir: 'choose' } },
    { id: 'starboard-steve', name: 'Starboard Steve', pts: 2,
      text: 'Gain 2 points and hand a card to an opponent.', fx: { type: 'give', dir: 'choose' } },
    { id: 'harbor-hank', name: 'Harbor Hank', pts: 2,
      text: 'Gain 2 points and swap hands with another player.', fx: { type: 'swapHands' } },
    { id: 'tiki-tony', name: 'Tiki Tony', pts: 5,
      text: 'Gain 5 points, and skip your next turn.', fx: { type: 'skipSelf' } },
    { id: 'luxury-lenny', name: 'Luxury Lenny', pts: -3,
      text: 'Lose 3 points and give a card to the player across from you.', fx: { type: 'give', dir: 'across' } },
    { id: 'seasick-susie', name: 'Seasick Susie', pts: -6,
      text: 'Lose 6 points and discard an extra card.', fx: { type: 'selfDiscard', n: 1 } },
    { id: 'trophy-tabitha', name: 'Trophy Tabitha', pts: 3,
      text: 'Gain 3 points and draw an extra card.', fx: { type: 'draw', n: 1 } },
    { id: 'party-penelope', name: 'Party Penelope', pts: 6,
      text: 'Gain 6 points and draw an extra two cards.', fx: { type: 'draw', n: 2 } },
    { id: 'buoyant-bob', name: 'Buoyant Bob', pts: 5,
      text: 'Gain 5 points and all players pass a card to the right.', fx: { type: 'passAll', dir: -1 } },
    { id: 'crabby-christoph', name: 'Crabby Christoph', pts: -5,
      text: 'Lose 5 points and discard an extra card.', fx: { type: 'selfDiscard', n: 1 } },
    { id: 'mainsail-mark', name: 'Mainsail Mark', pts: 5,
      text: 'Gain 5 points and draw an extra card.', fx: { type: 'draw', n: 1 } },
    { id: 'navigator-nick', name: 'Navigator Nick', pts: 3,
      text: 'Gain 3 points and draw an extra card.', fx: { type: 'draw', n: 1 } },
    { id: 'barnacle-ben', name: 'Barnacle Ben', pts: -5,
      text: 'Lose 5 points and discard an extra card.', fx: { type: 'selfDiscard', n: 1 } },
    { id: 'ebbtide-ed', name: 'Ebbtide Ed', pts: 5,
      text: "Gain 5 points and look at another player's hand.", fx: { type: 'peek' } }
  ];

  // ---- Build the card index. ids are stable strings used across the wire. ----
  var CARDS = {};       // id -> card
  var CLUB_DECK = [];   // 59 ids
  var MEMBER_DECK = []; // 25 ids

  Object.keys(SUITS).forEach(function (sk) {
    LETTERS.forEach(function (letter, i) {
      var id = sk + '-' + letter;
      CARDS[id] = {
        id: id, kind: 'suit', suit: sk, letter: letter, rank: i,
        name: SUIT_NAMES[sk][i],
        art: 'assets/cards/' + sk + '-' + letter.toLowerCase() + '-' + SLUGS[sk][i] + '.jpg'
      };
      CLUB_DECK.push(id);
    });
  });
  SPECIALS.forEach(function (s) {
    var id = 'sp-' + s.id;
    CARDS[id] = { id: id, kind: 'special', name: s.name, text: s.text,
      clarify: s.clarify || '', fx: s.fx, art: 'assets/cards/special-' + s.id + '.jpg' };
    CLUB_DECK.push(id);
  });
  MEMBERS.forEach(function (m) {
    var id = 'mb-' + m.id;
    CARDS[id] = { id: id, kind: 'member', name: m.name, pts: m.pts, text: m.text,
      fx: m.fx, art: 'assets/cards/member-' + m.id + '.jpg' };
    MEMBER_DECK.push(id);
  });

  G.data = {
    LETTERS: LETTERS, SUITS: SUITS, CARDS: CARDS,
    CLUB_DECK: CLUB_DECK, MEMBER_DECK: MEMBER_DECK,
    BACK_GENERAL: 'assets/cards/back-general.jpg',
    BACK_MEMBER: 'assets/cards/back-member.jpg',
    TARGET_DEFAULT: 50, HAND_SIZE: 7, MEMBERS_TO_WIN: 5
  };
}(typeof window !== 'undefined' ? (window.CC = window.CC || {}) : (module.exports = {})));
