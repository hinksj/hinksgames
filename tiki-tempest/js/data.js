// TIKI TEMPEST — card data. Canon: the printed cards (2024 print run).
(function (G) {
  'use strict';

  var INGREDIENTS = [
    { id: 'rum', name: 'Rum', rare: false, copies: 20 },
    { id: 'pineapple', name: 'Pineapple', rare: false, copies: 18 },
    { id: 'coconut-cream', name: 'Coconut Cream', rare: false, copies: 16 },
    { id: 'lime', name: 'Lime', rare: false, copies: 16 },
    { id: 'grenadine', name: 'Grenadine', rare: true, copies: 6 },
    { id: 'orange-liqueur', name: 'Orange Liqueur', rare: true, copies: 5 },
    { id: 'blue-curacao', name: 'Blue Curaçao', rare: true, copies: 5 },
    { id: 'nutmeg', name: 'Nutmeg', rare: true, copies: 5 }
  ];

  var RECIPES = [
    { id: 'caribbean-sunset', name: 'Caribbean Sunset', pts: 4, copies: 3,
      needs: { rum: 2, pineapple: 1 } },
    { id: 'pina-colada', name: 'Piña Colada', pts: 4, copies: 3,
      needs: { rum: 1, pineapple: 1, 'coconut-cream': 1 } },
    { id: 'coconut-fizz', name: 'Coconut Fizz', pts: 4, copies: 3,
      needs: { rum: 1, 'coconut-cream': 2 } },
    { id: 'lime-daiquiri', name: 'Lime Daquiri', pts: 4, copies: 3,
      needs: { rum: 1, lime: 2 } },
    { id: 'mai-tai', name: 'Mai Tai', pts: 6, copies: 2,
      needs: { rum: 2, lime: 1, 'orange-liqueur': 1 } },
    { id: 'blue-hawaiian', name: 'Blue Hawaiian', pts: 6, copies: 2,
      needs: { rum: 1, pineapple: 2, 'blue-curacao': 1 } },
    { id: 'painkiller', name: 'Painkiller', pts: 6, copies: 2,
      needs: { rum: 1, pineapple: 1, 'coconut-cream': 1, nutmeg: 1 } },
    { id: 'bahama-mama', name: 'Bahama Mama', pts: 6, copies: 2,
      needs: { rum: 1, 'coconut-cream': 1, pineapple: 1, grenadine: 1 } },
    { id: 'planters-punch', name: "Planter's Punch", pts: 6, copies: 2,
      needs: { rum: 1, lime: 1, grenadine: 1, 'orange-liqueur': 1 } }
  ];

  var SPECIALS = [
    { id: 'thieving-seagull', name: 'Thieving Seagull', copies: 4,
      text: 'Take any Ingredient Card off the table.',
      fx: 'seagull' },
    { id: 'paper-umbrella', name: 'Paper Umbrella', copies: 4,
      text: 'Protects from seagulls. Adds a point to cocktails. Once played, must remain.',
      fx: 'umbrella' },
    { id: 'guest-bartender', name: 'Guest Bartender', copies: 3,
      text: 'You may demand a specific ingredient from one player. If they have it, that card is now yours.',
      fx: 'demand' },
    { id: 'tiki-torchlight', name: 'Tiki Torchlight', copies: 3,
      text: 'Reveal 3 cards from the main deck and add one to your hand.',
      fx: 'torch' },
    { id: 'pirates-plunder', name: 'Pirate Plunder', copies: 3,
      text: "Steal a random card from an opponent's hand.",
      fx: 'plunder' },
    { id: 'tidal-handover', name: 'Tidal Handover', copies: 3,
      text: 'Each player passes one card from their hand to the player on their right.',
      fx: 'tidal' },
    { id: 'island-breeze', name: 'Island Breeze', copies: 3,
      text: 'All players draw 2 cards from the main deck.',
      fx: 'breeze' },
    { id: 'make-it-a-double', name: 'Make It a Double', copies: 3,
      text: 'Play when a cocktail is "served" to double its points.',
      fx: 'double' },
    { id: 'last-call', name: 'Last Call', copies: 1,
      text: 'This is the last round of play — tell the patrons to drink up.',
      fx: 'lastcall' },
    { id: 'storm-surge', name: 'Storm Surge', copies: 1,
      text: 'This card must be played immediately when drawn and ends the round.',
      fx: 'surge' }
  ];

  // ---- build card index: unique ids per physical card ----
  var CARDS = {}, MAIN_DECK = [], RECIPE_DECK = [];
  INGREDIENTS.forEach(function (ing) {
    for (var i = 1; i <= ing.copies; i++) {
      var id = 'ing-' + ing.id + '-' + i;
      CARDS[id] = { id: id, kind: 'ing', ing: ing.id, name: ing.name, rare: ing.rare,
        art: 'assets/cards/ing-' + ing.id + '.jpg' };
      MAIN_DECK.push(id);
    }
  });
  for (var b = 1; b <= 16; b++) {
    var bid = 'beer-' + b;
    CARDS[bid] = { id: bid, kind: 'beer', name: 'Beer', art: 'assets/cards/beer.jpg' };
    MAIN_DECK.push(bid);
  }
  SPECIALS.forEach(function (s) {
    for (var i = 1; i <= s.copies; i++) {
      var id = 'sp-' + s.id + '-' + i;
      CARDS[id] = { id: id, kind: 'special', sp: s.id, name: s.name, text: s.text,
        fx: s.fx, art: 'assets/cards/sp-' + s.id + '.jpg' };
      MAIN_DECK.push(id);
    }
  });
  RECIPES.forEach(function (r) {
    for (var i = 1; i <= r.copies; i++) {
      var id = 'rec-' + r.id + '-' + i;
      CARDS[id] = { id: id, kind: 'recipe', rec: r.id, name: r.name, pts: r.pts,
        needs: r.needs, art: 'assets/cards/recipe-' + r.id + '.jpg' };
      RECIPE_DECK.push(id);
    }
  });

  // Deck variants — "we can alter the number of cards used". The stocked bar
  // trims beers and surplus commons so rum density rises (helps classic mode).
  var STOCKED_CUTS = { beer: 10, pineapple: 14, 'coconut-cream': 12, lime: 12 };
  var DECKS = {
    printed: MAIN_DECK.slice(),
    stocked: MAIN_DECK.filter(function (id) {
      var c = CARDS[id];
      var n = parseInt(id.slice(id.lastIndexOf('-') + 1), 10);
      if (c.kind === 'beer') return n <= STOCKED_CUTS.beer;
      if (c.kind === 'ing' && STOCKED_CUTS[c.ing]) return n <= STOCKED_CUTS[c.ing];
      return true;
    })
  };

  G.data = {
    INGREDIENTS: INGREDIENTS, RECIPES: RECIPES, SPECIALS: SPECIALS, DECKS: DECKS,
    CARDS: CARDS, MAIN_DECK: MAIN_DECK, RECIPE_DECK: RECIPE_DECK,
    BACK_MAIN: 'assets/cards/back-main.jpg',
    BACK_RECIPE: 'assets/cards/back-recipe.jpg',
    HAND_SIZE: 5, MENU_SIZE: 4, TURNS_PER_ROUND: 10, PASSES_PER_ROUND: 14, HAND_BASE: 12, ROUNDS_DEFAULT: 2,
    PLAYS_PER_TURN: 2, BEER_MOST: 10, BEER_FEWEST: -5
  };
}(typeof window !== 'undefined' ? (window.TT = window.TT || {}) : (module.exports = {})));
