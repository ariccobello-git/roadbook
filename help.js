/* Aiuto e domande frequenti: risposte in 3 lingue, divise per soci, direttivo e amministrazione, con ricerca */
(function () {
  'use strict';
  var RB = window.RB, h = RB.h, t = RB.t;

  /* ogni voce: [domanda, risposta], ciascuna in [it, en, fr] */
  var FAQ = {
    soci: [
      [["Come entro nell'app?", "How do I sign in?", "Comment me connecter ?"],
        ["Apri il link dell'invito che ti ha mandato il direttivo: entri subito. In alternativa scrivi il codice di accesso di 8 caratteri nella schermata iniziale.", "Open the invite link the board sent you and you're in. Or type your 8-character access code on the start screen.", "Ouvre le lien d'invitation envoyé par le bureau : tu es connecté. Sinon saisis ton code d'accès de 8 caractères sur l'écran d'accueil."]],
      [["Ho perso il codice di accesso", "I lost my access code", "J'ai perdu mon code d'accès"],
        ["Se sei già dentro lo trovi in Altro → Il mio codice. Altrimenti chiedi al direttivo: ti rimanda l'invito su WhatsApp.", "If you're signed in, find it under More → My code. Otherwise ask the board to resend the WhatsApp invite.", "Si tu es connecté, il est dans Plus → Mon code. Sinon demande au bureau de te renvoyer l'invitation WhatsApp."]],
      [["Come metto l'app sulla schermata Home?", "How do I add the app to my Home Screen?", "Comment ajouter l'appli à l'écran d'accueil ?"],
        ["È gratis e non serve nessuno store. Tocca «Come installare l'app» qui sopra: ci sono i passi per iPhone e Android.", "It's free and needs no app store. Tap \"How to install the app\" above for the iPhone and Android steps.", "C'est gratuit, sans store. Touche « Comment installer l'appli » ci-dessus : les étapes iPhone et Android y sont."]],
      [["Non mi arrivano le notifiche", "I don't get notifications", "Je ne reçois pas les notifications"],
        ["Vai in Altro → Notifiche e attivale, poi tocca «Prova». Su iPhone funzionano solo se apri l'app dall'icona sulla Home. Controlla anche che il telefono non sia in Non disturbare o Full immersion.", "Go to More → Notifications, turn them on and tap \"Test\". On iPhone they only work when you open the app from the Home Screen icon. Also check Do Not Disturb or Focus.", "Va dans Plus → Notifications, active-les puis touche « Test ». Sur iPhone elles ne marchent que si tu ouvres l'appli depuis l'icône. Vérifie aussi Ne pas déranger ou Concentration."]],
      [["Come mi iscrivo a un Run?", "How do I sign up for a Run?", "Comment m'inscrire à un Run ?"],
        ["Nella scheda Run apri il Run e tocca «Ci sono». Se porti un passeggero lo aggiungi con un tocco. Dopo la data «Iscrizioni entro» la tua richiesta va approvata dal direttivo.", "In the Runs tab open the Run and tap \"I'm in\". Add a passenger with one tap. After the \"Sign up by\" date your request needs board approval.", "Dans l'onglet Runs, ouvre le Run et touche « J'y suis ». Ajoute un passager d'un geste. Après la date « Inscriptions jusqu'au », ta demande doit être validée par le bureau."]],
      [["Come mi cancello da un Run?", "How do I cancel my sign-up?", "Comment annuler mon inscription ?"],
        ["Apri il Run e cambia la risposta. Se le iscrizioni sono già chiuse, l'annullamento parte come richiesta al direttivo.", "Open the Run and change your answer. If sign-ups are closed, the cancellation goes to the board as a request.", "Ouvre le Run et change ta réponse. Si les inscriptions sont closes, l'annulation part comme demande au bureau."]],
      [["Come pago la quota?", "How do I pay the fee?", "Comment payer la cotisation ?"],
        ["Nella scheda Quote trovi quanto devi e come pagare. Dopo il bonifico puoi allegare la distinta in PDF: il tesoriere la verifica prima.", "The Fees tab shows what you owe and how to pay. After a bank transfer you can attach the receipt as a PDF so the treasurer checks it faster.", "L'onglet Cotisations indique le montant et comment payer. Après un virement tu peux joindre le justificatif en PDF pour accélérer la vérification."]],
      [["A cosa serve il pulsante Emergenza?", "What is the Emergency button for?", "À quoi sert le bouton Urgence ?"],
        ["Manda agli incaricati la tua posizione e il tipo di problema: moto, salute tua o di un altro. I numeri di soccorso si chiamano solo toccandoli. Funziona anche dalla schermata iniziale, senza accesso.", "It sends your position and the kind of problem (bike, your health or someone else's) to the team. Emergency numbers only dial when you tap them. It also works from the start screen without signing in.", "Il envoie ta position et le type de problème (moto, ta santé ou celle d'un autre) à l'équipe. Les numéros d'urgence ne s'appellent qu'au toucher. Il marche aussi depuis l'écran d'accueil, sans connexion."]],
      [["Cosa sono i Dati per le emergenze?", "What are the Emergency details?", "Que sont les Données d'urgence ?"],
        ["In Altro → Dati per le emergenze puoi salvare le informazioni utili ai soccorsi. Le vedono solo gli incaricati delle emergenze e puoi cancellarle quando vuoi.", "Under More → Emergency details you can save information useful to rescuers. Only the emergency team sees it and you can delete it any time.", "Dans Plus → Données d'urgence tu peux enregistrer les informations utiles aux secours. Seule l'équipe d'urgence les voit et tu peux les effacer à tout moment."]],
      [["Mi sono perso durante il giro: cosa faccio?", "I got separated from the group: what do I do?", "Je me suis perdu pendant la sortie : que faire ?"],
        ["Fermati in un posto sicuro, tocca Emergenza → «Mi sono perso». Il capogruppo o il safety ti chiamano e ti mandano la sosta dove ritrovare il gruppo. Poi tocca «Naviga e condividi con il capogruppo»: Google Maps ti guida e lui ti segue in diretta.", "Stop somewhere safe and tap Emergency → \"I'm lost\". The road captain or the safety rider will call you and send the stop where you'll meet the group. Then tap \"Navigate and share with the road captain\": Google Maps guides you and they follow you live.", "Arrête-toi en lieu sûr et touche Urgence → « Je suis perdu ». Le chef de groupe ou le safety t'appellent et t'envoient l'arrêt où retrouver le groupe. Touche ensuite « Naviguer et partager avec le chef de groupe » : Google Maps te guide et il te suit en direct."]],
      [["Posso usare l'app mentre guido?", "Can I use the app while riding?", "Puis-je utiliser l'appli en roulant ?"],
        ["No. L'app si usa da fermi. Durante il giro lavora da sola e ti avvisa con le notifiche: partenza, «Si riparte» ed emergenze.", "No. Use the app only when stopped. During the ride it works on its own and alerts you with notifications: start, \"Restart\" and emergencies.", "Non. L'appli s'utilise à l'arrêt. Pendant la sortie elle travaille seule et te prévient par notification : départ, « On repart » et urgences."]],
      [["Cosa vuol dire «Condividi la mia posizione»?", "What does \"Share my position\" do?", "Que fait « Partager ma position » ?"],
        ["Durante il Run gli organizzatori vedono dove sei sulla mappa del gruppo. Funziona finché l'app resta aperta; si spegne da sola a fine giro.", "During the Run the organisers see you on the group map. It works while the app stays open and turns off by itself after the ride.", "Pendant le Run les organisateurs te voient sur la carte du groupe. Cela marche tant que l'appli reste ouverte et s'arrête seul en fin de sortie."]],
      [["Cos'è «Si riparte»?", "What is \"Restart\"?", "Qu'est-ce que « On repart » ?"],
        ["Durante una sosta il capogruppo avvisa quando si riparte: ricevi una notifica anche con il telefono in tasca.", "During a stop the road captain announces when the group moves on: you get a notification even with the phone in your pocket.", "Pendant un arrêt le chef de groupe annonce le départ : tu reçois une notification même téléphone en poche."]],
      [["A cosa serve la Tessera digitale?", "What is the Digital card for?", "À quoi sert la Carte numérique ?"],
        ["In Altro → Tessera digitale c'è il tuo QR: al ritrovo lo mostri e il check-in è fatto.", "Under More → Digital card you'll find your QR: show it at the meeting point and you're checked in.", "Dans Plus → Carte numérique se trouve ton QR : montre-le au rendez-vous et ton check-in est fait."]],
      [["Come cambio lingua, colore o tema scuro?", "How do I change language, colour or dark mode?", "Comment changer langue, couleur ou mode sombre ?"],
        ["In Altro → Impostazioni scegli lingua, uno degli 8 colori, aspetto chiaro, scuro o automatico, e i suoni.", "Under More → Settings pick the language, one of 8 colours, light, dark or automatic appearance, and sounds.", "Dans Plus → Réglages choisis la langue, une des 8 couleurs, l'apparence claire, sombre ou automatique, et les sons."]]
    ],
    dir: [
      [["Come creo un Run?", "How do I create a Run?", "Comment créer un Run ?"],
        ["Altro → Nuovo Run, oppure il + nella scheda Run. Puoi copiare l'ultimo Run o partire da zero. Dopo il salvataggio l'app propone di avvisare il gruppo WhatsApp.", "More → New run, or the + in the Runs tab. Copy the last Run or start from scratch. After saving, the app offers to tell the WhatsApp group.", "Plus → Nouveau Run, ou le + dans l'onglet Runs. Copie le dernier Run ou pars de zéro. Après l'enregistrement l'appli propose de prévenir le groupe WhatsApp."]],
      [["Come invito i soci a un Run?", "How do I invite members to a Run?", "Comment inviter les membres à un Run ?"],
        ["Apri il Run → «Invita al Run»: c'è il link, il QR e «Invia sul gruppo WhatsApp». Chi apre il link arriva direttamente sul Run.", "Open the Run → \"Invite to the Run\": there's the link, the QR and \"Send to the WhatsApp group\". Whoever opens the link lands right on the Run.", "Ouvre le Run → « Inviter au Run » : lien, QR et « Envoyer sur le groupe WhatsApp ». Qui ouvre le lien arrive directement sur le Run."]],
      [["Come mando un avviso a tutti?", "How do I send an announcement to everyone?", "Comment envoyer une annonce à tous ?"],
        ["Altro → Avvisi → Nuovo avviso. Compare in cima alla scheda Run; dopo la pubblicazione puoi mandarlo anche sul gruppo WhatsApp con un tocco.", "More → Announcements → New announcement. It shows at the top of the Runs tab; after publishing you can also send it to the WhatsApp group with one tap.", "Plus → Annonces → Nouvelle annonce. Elle apparaît en haut de l'onglet Runs ; après publication tu peux aussi l'envoyer sur le groupe WhatsApp d'un geste."]],
      [["Come faccio il check-in al ritrovo?", "How do I check people in?", "Comment faire le check-in ?"],
        ["Altro → Check-in al ritrovo, oppure «Check-in con QR» e inquadri la tessera digitale del socio.", "More → Check-in at the meeting point, or \"QR check-in\" and scan the member's digital card.", "Plus → Pointage au rendez-vous, ou « Enregistrement par QR » en scannant la carte numérique du membre."]],
      [["Dove approvo iscrizioni e annullamenti in ritardo?", "Where do I approve late sign-ups and cancellations?", "Où valider inscriptions et annulations tardives ?"],
        ["Altro → Richieste da approvare. Chi ha chiesto riceve una notifica con la tua decisione.", "More → Requests to approve. The member gets a notification with your decision.", "Plus → Demandes à approuver. Le membre reçoit une notification avec ta décision."]],
      [["Come preparo la formazione?", "How do I set up the formation?", "Comment préparer la formation ?"],
        ["Altro → Formazione: assegni road captain, safety e scopa, poi pubblichi. I soci la vedono nel Run.", "More → Formation: assign road captains, safety and sweep, then publish. Members see it in the Run.", "Plus → Formation : attribue road captains, safety et serre-file, puis publie. Les membres la voient dans le Run."]],
      [["Come faccio partire il Run?", "How do I start the Run?", "Comment lancer le Run ?"],
        ["L'incaricato della partenza, il direttore o il vice toccano «Fai partire» nel Run. Tutti i soci ricevono la notifica.", "The person in charge of the start, the director or the deputy tap \"Start\" in the Run. All members get a notification.", "Le responsable du départ, le directeur ou l'adjoint touchent « Démarrer » dans le Run. Tous les membres reçoivent une notification."]],
      [["Un socio si è perso: cosa devo fare?", "A member got lost: what should I do?", "Un membre s'est perdu : que faire ?"],
        ["Capogruppo e safety ricevono l'avviso con la sosta proposta: chiamate il socio e confermate la sosta. Con «Segui su WhatsApp» aprite la chat dove arriva il suo viaggio di Google Maps. Direttore e vice sono informati e intervengono solo se serve.", "Road captain and safety get the alert with a suggested stop: call the member and confirm the stop. \"Follow on WhatsApp\" opens the chat where their Google Maps trip arrives. Director and deputy are informed and step in only if needed.", "Chef de groupe et safety reçoivent l'alerte avec l'arrêt proposé : appelez le membre et confirmez l'arrêt. « Suivre sur WhatsApp » ouvre la discussion où arrive son trajet Google Maps. Directeur et adjoint sont informés et n'interviennent que si besoin."]],
      [["Dove vedo le emergenze aperte?", "Where do I see open emergencies?", "Où voir les urgences ouvertes ?"],
        ["Altro → Emergenze: elenco delle richieste con posizione, tipo e stato. Ti arriva anche una notifica.", "More → Emergencies: the list of requests with position, type and status. You also get a notification.", "Plus → Urgences : la liste des demandes avec position, type et état. Tu reçois aussi une notification."]],
      [["Posso caricare i Run da Excel?", "Can I import Runs from Excel?", "Puis-je importer des Runs depuis Excel ?"],
        ["Sì: Altro → Importa Run da Excel. Le istruzioni sul formato del file sono nella stessa schermata.", "Yes: More → Import Runs from Excel. The file format instructions are on the same screen.", "Oui : Plus → Importer des Runs depuis Excel. Les instructions sur le format sont sur le même écran."]]
    ],
    adm: [
      [["Come aggiungo un socio e gli mando l'invito?", "How do I add a member and send the invite?", "Comment ajouter un membre et lui envoyer l'invitation ?"],
        ["Altro → Nuovo socio. Nella sua scheda tocca «Invia invito su WhatsApp»: il messaggio contiene il link che lo fa entrare e il codice.", "More → New member. In their profile tap \"Send invitation on WhatsApp\": the message has the sign-in link and the code.", "Plus → Nouveau membre. Dans sa fiche touche « Envoyer l'invitation sur WhatsApp » : le message contient le lien de connexion et le code."]],
      [["Un socio ha perso il telefono o il codice", "A member lost their phone or code", "Un membre a perdu son téléphone ou son code"],
        ["Nella scheda del socio tocca «Nuovo codice»: quello vecchio smette di funzionare. Poi rimandagli l'invito.", "In the member's profile tap \"New code\": the old one stops working. Then resend the invite.", "Dans la fiche du membre touche « Nouveau code » : l'ancien ne marche plus. Renvoie ensuite l'invitation."]],
      [["Come invito tutti i soci in una volta?", "How do I invite all members at once?", "Comment inviter tous les membres d'un coup ?"],
        ["Altro → Esporta codici di accesso (Excel): per ogni socio c'è il link d'invito e il collegamento WhatsApp già pronto.", "More → Export access codes (Excel): each member has the invite link and a ready WhatsApp link.", "Plus → Exporter les codes d'accès (Excel) : chaque membre a le lien d'invitation et un lien WhatsApp prêt."]],
      [["Come carico l'elenco soci?", "How do I load the member list?", "Comment charger la liste des membres ?"],
        ["Altro → Importa soci da Excel. Puoi anche esportare l'elenco aggiornato.", "More → Import members from Excel. You can also export the updated list.", "Plus → Importer des membres depuis Excel. Tu peux aussi exporter la liste à jour."]],
      [["Chi può fare cosa?", "Who can do what?", "Qui peut faire quoi ?"],
        ["Altro → Profili di accesso: per ogni ruolo scegli i permessi, per esempio creare Run, vedere i telefoni o gestire le emergenze.", "More → Access profiles: choose the permissions for each role, such as creating Runs, seeing phone numbers or handling emergencies.", "Plus → Profils d'accès : choisis les droits de chaque rôle, par exemple créer des Runs, voir les téléphones ou gérer les urgences."]],
      [["Dove cambio nome, logo e modalità di pagamento?", "Where do I change name, logo and payment details?", "Où changer nom, logo et modalités de paiement ?"],
        ["Altro → Impostazioni chapter per nome e logo, Altro → Come pagare la quota per IBAN e contanti.", "More → Chapter settings for name and logo, More → How to pay the fee for IBAN and cash.", "Plus → Paramètres du chapter pour le nom et le logo, Plus → Comment payer la cotisation pour l'IBAN et les espèces."]]
    ]
  };

  function li() { var i = ['it', 'en', 'fr'].indexOf(RB.pref.lang); return i < 0 ? 0 : i; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function groups() {
    var g = [['soci', t('help_g_soci')]];
    if (RB.can('runs_edit') || RB.can('signups_manage') || RB.can('formation_edit') || RB.can('emergency_manage')) g.push(['dir', t('help_g_dir')]);
    if (RB.can('members_edit') || RB.can('profiles_manage') || RB.can('settings_edit')) g.push(['adm', t('help_g_adm')]);
    return g;
  }
  RB.helpFaq = FAQ;

  RB.helpSheet = function () {
    var gs = groups(), cur = gs[0][0], q = '', list = h('div', { id: 'help-list' });
    var search = h('input', { type: 'search', id: 'help-q', placeholder: t('help_search'), 'aria-label': t('help_search'), autocomplete: 'off',
      oninput: function () { q = norm(search.value.trim()); draw(); } });
    function item(x) {
      var L = li();
      return h('details', { class: 'faq' }, h('summary', null, x[0][L], RB.icon('down')), h('p', null, x[1][L]));
    }
    function draw() {
      RB.clear(list);
      var any = 0;
      gs.forEach(function (g) {
        if (!q && g[0] !== cur) return;
        var items = FAQ[g[0]].filter(function (x) { return !q || norm(x[0][li()] + ' ' + x[1][li()]).indexOf(q) >= 0; });
        if (!items.length) return;
        any += items.length;
        if (q && gs.length > 1) list.appendChild(RB.secT(g[1]));
        list.appendChild(h('div', { class: 'faq-box' }, items.map(item)));
      });
      if (!any) list.appendChild(RB.empty('quote', t('help_none'), t('help_none_d')));
    }
    var body = h('div', { id: 'help' },
      h('div', { class: 'list' },
        RB.row({ lead: RB.icon('quote'), title: t('tour_title'), sub: t('tour_sub'), id: 'help-tour', onclick: function () { RB.tour(); } }),
        RB.isStandalone() ? null : RB.row({ lead: RB.icon('plus'), title: t('ig_how_login'), id: 'help-install', onclick: function () { RB.installGuide(); } })),
      h('div', { class: 'help-search' }, search),
      gs.length > 1 ? h('div', { class: 'help-tabs', id: 'help-tabs' }, RB.seg(gs.map(function (g) { return { v: g[0], label: g[1] }; }), cur, function (v) { cur = v; draw(); })) : null,
      list);
    draw();
    return RB.sheet({ title: t('help_title'), content: body, full: true, leftLabel: t('close') });
  };
})();
