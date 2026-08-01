// GAME TOUR — clickable guided walkthrough. Spotlights each zone of the
// table with a golden halo and explains it. TT.tour.start() to begin.
(function (G) {
  'use strict';
  var steps = [
    { sel: null, title: 'Welcome to the bar! \ud83c\udf79', text: 'Tiki Tempest: stock ingredients, serve cocktails off the shared menu, shelve beers for the end-game count \u2014 and watch the sky. This tour shows the table while the game plays on.' },
    { sel: '#handRow', title: 'Your hand', text: 'In Draft mode everyone secretly keeps ONE card each pass, then hands rotate \u2014 and every hand tops up from the stock. Click a card, then hit Keep. (Classic mode deals turns instead: draw 2, play 2.)' },
    { sel: '#prompt', title: 'The action bar', text: 'Instructions and buttons appear here \u2014 Keep (or Keep BOTH with a Guest Bartender set aside), and in Classic mode Stock bar / Shelve beer / Play special / End turn.' },
    { sel: '#menuRow', title: 'The Drink Menu', text: 'The recipes everyone is racing for. The text above each card shows what it needs \u2014 and lights up as YOUR bar fills. A glowing card is servable RIGHT NOW: click it! Serving is always free.' },
    { sel: '#barRow', title: 'Your bar', text: 'Kept ingredients gather here to pay for cocktails. A \u2602\ufe0f Paper Umbrella shields your whole bar from Thieving Seagulls until it garnishes your next drink (+1).' },
    { sel: '#oppRow', title: 'The competition', text: 'Their hands, bars, \ud83c\udf7a beers and served drinks. \u2714 means they\u2019ve locked their pick. Eye their bars \u2014 that\u2019s where your seagull shops.' },
    { sel: '#piles', title: 'The stock', text: 'Deck, discard, and the recipe deck. Storm Surge lurks in the stock \u2014 ANY draw can dredge it up and end the round on the spot. Island Breeze is a gamble for exactly that reason.' },
    { sel: '#logCol', title: 'Log &amp; chat', text: 'The table\u2019s story, with big banners for storms and Last Call. Online tables get a chat box \u2014 essential for gloating.' },
    { sel: '#topbar', title: 'Music, sound &amp; rules', text: '\ud83c\udfb5 island exotica soundtrack, \ud83d\udd0a effects, the rulebook \u2014 and the build number if anything ever looks off. Now go earn Master Mixologist!' }
  ];
  var idx = 0, halo = null, box = null;
  function ensure() {
    if (halo) return;
    halo = document.createElement('div');
    box = document.createElement('div');
    box.id = 'tourBox';
    document.body.appendChild(halo);
    document.body.appendChild(box);
    window.addEventListener('resize', function () { if (box.style.display !== 'none') show(); });
  }
  function stop() {
    if (halo) { halo.style.display = 'none'; box.style.display = 'none'; }
  }
  function show() {
    var s = steps[idx];
    var el = s.sel ? document.querySelector(s.sel) : null;
    var r = el ? el.getBoundingClientRect() : null;
    if (!r || (r.width === 0 && r.height === 0)) {
      r = { left: window.innerWidth / 2 - 160, top: window.innerHeight * 0.3, width: 320, height: 10, bottom: window.innerHeight * 0.3 + 10 };
    }
    halo.style.cssText = 'display:block;position:fixed;z-index:1150;pointer-events:none;' +
      'border:3px solid var(--gold);border-radius:12px;transition:all .25s;' +
      'box-shadow:0 0 0 9999px rgba(0,0,0,0.55), 0 0 22px var(--gold);' +
      'left:' + (r.left - 6) + 'px;top:' + (r.top - 6) + 'px;' +
      'width:' + (r.width + 12) + 'px;height:' + (r.height + 12) + 'px;';
    box.innerHTML =
      '<h4>' + s.title + '</h4><p>' + s.text + '</p>' +
      '<div class="tnav">' +
      '<button id="tPrev"' + (idx === 0 ? ' disabled' : '') + '>&lsaquo; Back</button>' +
      '<span class="tn">' + (idx + 1) + ' / ' + steps.length + '</span>' +
      '<button id="tNext" class="gold">' + (idx === steps.length - 1 ? 'Done!' : 'Next &rsaquo;') + '</button>' +
      '<button id="tSkip" class="ghost">Skip tour</button></div>';
    var bw = 340;
    var top = (r.bottom || r.top) + 16;
    if (top + 190 > window.innerHeight) top = Math.max(10, r.top - 210);
    var left = Math.min(Math.max(10, r.left), window.innerWidth - bw - 14);
    box.style.cssText = 'display:block;position:fixed;z-index:1160;width:' + bw + 'px;' +
      'left:' + left + 'px;top:' + top + 'px;background:var(--panel);' +
      'border:1px solid var(--gold);border-radius:12px;padding:14px 16px;' +
      'box-shadow:0 10px 40px #000d;';
    box.querySelector('h4').style.cssText = 'color:var(--gold);margin:0 0 6px;font-size:17px;';
    box.querySelector('p').style.cssText = 'color:var(--text);font-size:13.5px;line-height:1.45;margin:0 0 10px;';
    box.querySelector('.tnav').style.cssText = 'display:flex;gap:8px;align-items:center;';
    box.querySelector('.tn').style.cssText = 'color:var(--dim);font-size:12px;flex:1;text-align:center;';
    box.querySelector('#tPrev').addEventListener('click', function () { idx--; show(); });
    box.querySelector('#tNext').addEventListener('click', function () {
      if (idx === steps.length - 1) stop(); else { idx++; show(); }
    });
    box.querySelector('#tSkip').addEventListener('click', stop);
  }
  G.tour = {
    start: function () { ensure(); idx = 0; show(); },
    stop: stop
  };
}(window.TT = window.TT || {}));
