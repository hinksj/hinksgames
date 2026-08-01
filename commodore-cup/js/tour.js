// GAME TOUR — clickable guided walkthrough. Spotlights each zone of the
// table with a golden halo and explains it. CC.tour.start() to begin.
(function (G) {
  'use strict';
  var steps = [
    { sel: null, title: 'Welcome aboard! \u2693', text: 'Commodore Cup is a rummy race: meld cards for points, court club members for votes, and be first to 50 points WITH 5 members backing you. This tour shows you the table \u2014 the game keeps playing, so take your time.' },
    { sel: '#piles', title: 'Draw &amp; discard', text: 'Every turn starts by drawing one card \u2014 from the face-down pile or the face-up discard. The third pile is the Member Deck: the club\u2019s 25 members, courted after you meld. It never reshuffles!' },
    { sel: '#handRow', title: 'Your hand', text: 'Click cards to select them. Sets are 3\u20134 cards of the SAME LETTER in different suits; runs are 3+ letters in a row in ONE suit. Drag to rearrange, or use the sort buttons below.' },
    { sel: '#prompt', title: 'The action bar', text: 'Your buttons live here: Meld a selection, Play a special (one per turn), Court a member \u2014 it glows gold when you\u2019ve earned a Drive \u2014 and Discard to end your turn. Hint is there when you\u2019re stuck.' },
    { sel: '#melds', title: 'The table', text: 'Melds live here and can\u2019t be stolen. You can extend ANYONE\u2019S meld \u2014 the card still scores for you (your color dot marks it). Each new set or run you lay earns a knock on the member deck.' },
    { sel: '#oppRow', title: 'Your rivals', text: 'Cards in hand, score, and \u2693 club support (you need 5 votes to win \u2014 even grumpy members count). Their courted members show as little portraits.' },
    { sel: '#logCol', title: 'Log &amp; chat', text: 'Everything that happens is narrated here. When someone steals, swaps, or skips you, a big \u26a0\ufe0f banner makes sure you see it. Online tables get a chat box underneath.' },
    { sel: '#topbar', title: 'Music, sound &amp; rules', text: '\ud83c\udfb5 synthwave soundtrack, \ud83d\udd0a effects, and the full illustrated rulebook. Now \u2014 hoist the burgee and go be Commodore!' }
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
}(window.CC = window.CC || {}));
