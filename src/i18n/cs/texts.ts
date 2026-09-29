/**
 * Czech descriptions and fact lists of the hand-written objects, keyed by body id.
 *
 * Style: numbers with a decimal comma, thousands separated by a space, units after a non-breaking space. Astronomical
 * conventions follow Czech usage (přísluní/odsluní, Rocheova mez, planetka, vázaná rotace, meteorický roj…). Anything
 * that would have to be declined ("kolem Uranu", "s Epimetheem") names the object with an apposition instead
 * ("měsíc Epimetheus"), because the game cannot inflect the names of user-created or catalogue objects.
 */
export interface CsText { d?: string; f?: string[] }

const RAW: Record<string, CsText> = {
  sun: {
    d: 'Hvězda ve středu Sluneční soustavy, která v sobě soustřeďuje 99,86 % její hmotnosti. Každou sekundu přemění zhruba 600 milionů tun vodíku na helium.',
    f: ['Světlu trvá cesta na Zemi 8 min 20 s.', 'Jádro dosahuje teploty přibližně 15 milionů K.', 'Právě prochází zhruba polovinou své asi 10 miliard let dlouhé existence na hlavní posloupnosti.'],
  },
  mercury: {
    d: 'Nejmenší planeta a nejbližší ke Slunci. Silně zkráterovaná, s extrémními teplotními výkyvy od 100 K v noci po 700 K ve dne.',
    f: ['Sluneční den na Merkuru trvá 176 pozemských dní.', 'V trvale zastíněných polárních kráterech se nachází ledové usazeniny.', 'Slunce obletí za pouhých 88 dní.'],
  },
  venus: {
    d: 'Svět s uprchlým skleníkovým efektem, zahalený mraky kyseliny sírové. Její povrch je žhavější než na Merkuru a tlak odpovídá hloubce 900 m pod zemskými oceány.',
    f: ['Otáčí se zpětně (retrográdně) jednou za 243 dní — déle, než trvá její 225denní rok.', 'Slunce tam vychází na západě.', 'Tlak na povrchu: asi 92 barů.'],
  },
  earth: {
    d: 'Náš domov: jediné místo, o němž víme, že se na něm vyskytuje život. Povrch ze 71 % pokrývá kapalná voda a obklopuje ho tenká dusíkokyslíková atmosféra.',
    f: ['Jediná známá planeta s deskovou tektonikou a kapalnými oceány na povrchu.', 'Měsíc stabilizuje sklon její osy na zhruba 23,4°.', 'Má silné magnetické pole, které vytváří tekuté železné vnější jádro.'],
  },
  mars: {
    d: 'Rudá planeta: studený pouštní svět s nejvyšší sopkou Sluneční soustavy (Olympus Mons, 22 km) a s nejdelším systémem kaňonů (Valles Marineris).',
    f: ['Den (sol) trvá 24 h 37 min.', 'Má dva drobné měsíce, Phobos a Deimos.', 'Existují důkazy o dávných říčních deltách a jezerech.'],
  },
  jupiter: {
    d: 'Největší planeta: plynný obr s více než dvojnásobnou hmotností všech ostatních planet dohromady. Velká rudá skvrna je bouře širší než Země, která zuří už celá staletí.',
    f: ['Otočí se za necelých 10 hodin, nejrychleji ze všech planet.', '95 potvrzených měsíců včetně čtyř velkých Galileových měsíců.', 'Vyzařuje víc tepla, než přijímá od Slunce.'],
  },
  saturn: {
    d: 'Prstencový klenot Sluneční soustavy. Jeho hustota je nižší než hustota vody — v dostatečně velké vaně by plaval. Prstence tvoří převážně vodní led; rozkládají se na 280 000 km, ale místy jsou silné jen asi 10 m.',
    f: ['Kolem severního pólu krouží trvalý šestiúhelníkový tryskový proud.', '146 známých měsíců.', 'V blízkosti rovníku dosahují větry rychlosti 1 800 km/h.'],
  },
  uranus: {
    d: 'Ledový obr, který se kolem Slunce valí na boku — jeho osa je nakloněna o 97,8°. Metan v atmosféře pohlcuje červené světlo, a dává tak planetě bledě azurovou barvu.',
    f: ['Nejchladnější planetární atmosféra: minimum 49 K.', 'Objevil ho William Herschel v roce 1781.', 'Má 13 známých prstenců a 28 měsíců.'],
  },
  neptune: {
    d: 'Nejbouřlivější planeta, s nadzvukovými bouřemi o rychlosti až 2 100 km/h. Její sytě modrou barvu způsobují metan a dosud neidentifikovaná složka.',
    f: ['Objeven v roce 1846 na základě matematické předpovědi z poruch dráhy Uranu.', 'Kolem Slunce oběhne za 164,8 roku.', 'Jeho měsíc Triton obíhá zpětně a je pravděpodobně zachyceným objektem Kuiperova pásu.'],
  },
  pluto: {
    d: 'Nejslavnější trpasličí planeta s obřím srdcem z dusíkového ledu (Tombaugh Regio), horami z vodního ledu a namodralou zamlženou atmosférou. Pluto a jeho měsíc Charon obíhají kolem bodu, který leží mimo Pluto.',
    f: ['Navštívila ho v červenci 2015 sonda New Horizons.', 'Kolem Slunce oběhne za 248 pozemských let.', 'Pět známých měsíců: Charon, Styx, Nix, Kerberos, Hydra.'],
  },
  ceres: { d: 'Největší těleso v pásu planetek a jediná trpasličí planeta ve vnitřní Sluneční soustavě. Jasné solné usazeniny v kráteru Occator naznačují podpovrchovou zásobárnu solanky.' },
  eris: { d: 'Nejhmotnější známá trpasličí planeta, o něco menší než Pluto, ale o 27 % těžší. Její objev v roce 2006 vyvolal předefinování pojmu „planeta“.' },
  haumea: { d: 'Rychle rotující trpasličí planeta ve tvaru vejce, která se otočí jednou za 3,9 hodiny, má dva měsíce a prstenec.' },
  makemake: { d: 'Načervenalá trpasličí planeta v Kuiperově pásu, pokrytá metanovým ledem.' },
  gonggong: { d: 'Vzdálená červená trpasličí planeta na výstředné dráze s měsícem Xiangliu.' },
  quaoar: { d: 'Objekt Kuiperova pásu s prstencem hluboko za Rocheovou mezí, což zpochybňuje teorie vzniku prstenců.' },
  sedna: { d: 'Jeden z nejčervenějších objektů Sluneční soustavy, na extrémní dráze s oběžnou dobou 11 400 let, která sahá až do ~940 AU. Přísluním projde v roce 2076.' },
  orcus: { d: 'Plutino v rezonanci 2 : 3 s Neptunem, často nazývané „anti-Pluto“, protože jeho dráha zrcadlí dráhu Pluta.' },
  vesta: { d: 'Druhá nejhmotnější planetka, diferencované protoplanetární těleso s obří impaktní pánví u jižního pólu (Rheasilvia), jejíž centrální vrchol se tyčí do výšky 22 km — dvojnásobku Everestu. Zdroj meteoritů typu HED.' },
  pallas: { d: 'Třetí největší planetka, na strmě skloněné dráze (35°).' },
  hygiea: { d: 'Čtvrtá největší planetka, téměř kulatá — kandidát na trpasličí planetu.' },
  psyche: { d: 'Možná odhalené železo-niklové jádro rozbité protoplanety a cíl mise NASA Psyche (start v roce 2023).' },
  eros: { d: 'První objevená blízkozemní planetka (1898), první obíhaná kosmickou sondou (NEAR Shoemaker, 2000) a první, na níž sonda přistála.' },
  ida: { d: 'První planetka, u níž byl nalezen měsíc — Dactyl (sonda Galileo, 1993).' },
  mathilde: { d: 'Uhlíkem bohatá hromada sutin s obřími krátery, která se otočí jednou za 17 dní.' },
  lutetia: { d: 'Navštívila ji sonda Rosetta v roce 2010.' },
  itokawa: { d: 'Hromada sutin ve tvaru arašídu; sonda Hayabusa z ní v roce 2010 přivezla vzorky.' },
  ryugu: { d: 'Tmavá hromada sutin ve tvaru diamantu, z níž odebrala vzorky sonda Hayabusa2 (2018–2019).' },
  bennu: { d: 'Vzorky z ní odebrala sonda OSIRIS-REx (2020); materiál se na Zemi vrátil v roce 2023. V 80. letech 22. století má malou pravděpodobnost srážky se Zemí.' },
  apophis: { d: 'Dne 13. dubna 2029 projde ve vzdálenosti 32 000 km od Země — blíž než geostacionární družice — a bude viditelná pouhým okem.' },
  didymos: { d: 'Dvojplanetka; kosmická sonda NASA DART v září 2022 záměrně narazila do jejího měsíce Dimorphos a zkrátila jeho oběžnou dobu o 33 minut.' },
  phaethon: { d: 'Mateřské těleso meteorického roje Geminid; ke Slunci se přibližuje blíž (0,14 AU) než kterákoli jiná pojmenovaná planetka.' },
  chiron: { d: 'První objevený kentaur: ledové těleso mezi Saturnem a Uranem, které se chová jako planetka i jako kometa.' },
  chariklo: { d: 'Největší známý kentaur a první planetka, u níž byly nalezeny prstence.' },
  arrokoth: { d: 'Kontaktní dvojité těleso ve tvaru „sněhuláka“ — nejvzdálenější objekt, který kdy kosmická sonda prozkoumala (přelet sondy New Horizons 1. ledna 2019). Jeho červenou barvu způsobují organické látky zpracované zářením.' },
  dimorphos: { d: 'Dne 26. září 2022 do něj narazila sonda DART při prvním testu planetární obrany — zkrátila jeho oběžnou dobu o 33 minut.' },
  moon: {
    d: 'Jediná přirozená družice Země a pátý největší měsíc Sluneční soustavy. Jeho gravitace vyvolává naše slapy a zpomaluje rotaci Země asi o 2 ms za století.',
    f: ['Ke Zemi je stále otočený stejnou stranou (vázaná rotace).', 'Od Země se vzdaluje rychlostí 3,8 cm za rok.', 'V letech 1969 až 1972 se po jeho povrchu prošlo dvanáct lidí.'],
  },
  phobos: { d: 'Větší, vnitřní měsíc Marsu; obíhá tak blízko, že dvakrát denně vychází na západě a zapadá na východě. Za asi 50 milionů let se rozpadne, nebo dopadne na Mars.' },
  io: {
    d: 'Sopečně nejaktivnější těleso Sluneční soustavy s více než 400 činnými sopkami, které pohání slapový ohřev od Jupiteru. Povrch má pomalovaný žlutí, oranží a červení síry.',
    f: ['Lávové fontány vystřelují do výšky 400 km.', 'Je v orbitální rezonanci 1 : 2 : 4 s Evropou a Ganymedem.'],
  },
  europa: {
    d: 'Měsíc s ledovou slupkou, pod níž se skrývá globální slaný oceán s asi dvojnásobným množstvím vody než všechny pozemské oceány. Jedno z nejlepších míst pro hledání mimozemského života.',
    f: ['Kůru tvoří 15–25 km ledu nad oceánem hlubokým až 100 km.', 'Její hladký povrch patří k nejmladším ve Sluneční soustavě.'],
  },
  ganymede: {
    d: 'Největší měsíc Sluneční soustavy — větší než Merkur — a jediný s vlastním magnetickým polem.',
    f: ['Má podpovrchový slaný oceán uzavřený mezi vrstvami ledu.', 'Je větší než planeta Merkur, ale má jen poloviční hmotnost.'],
  },
  callisto: { d: 'Nejvíce zkráterované těleso Sluneční soustavy; jeho prastarý povrch se za 4 miliardy let sotva změnil.' },
  amalthea: { d: 'Načervenalý, podlouhlý vnitřní měsíc — nejčervenější objekt Sluneční soustavy.' },
  mimas: { d: 'Domov obřího kráteru Herschel, jehož průměr činí třetinu průměru měsíce, a proto připomíná Hvězdu smrti.' },
  enceladus: {
    d: 'Malý, zářivě bílý ledový svět, který chrlí gejzíry vodní páry z „tygřích pruhů“ — trhlin poblíž jižního pólu, jež napájí podpovrchový oceán.',
    f: ['Nejodrazivější těleso Sluneční soustavy (albedo ≈ 1).', 'Jeho vývěry zásobují prstenec E Saturnu.'],
  },
  rhea: { d: 'Druhý největší měsíc Saturnu, prastará zkráterovaná koule ledu a hornin.' },
  titan: {
    d: 'Jediný měsíc s hustou atmosférou (1,5× vyšší tlak než na Zemi) a jediný další svět se stabilními kapalinami na povrchu — jezery a moři z metanu a etanu. Řeky, duny a mraky mu dávají až podivuhodně zemský cyklus počasí.',
    f: ['Přistála na něm sonda Huygens agentury ESA v roce 2005.', 'Dron Dragonfly na jaderný pohon má dorazit v roce 2034.'],
  },
  hyperion: { d: 'Houbovitý, překotně se převalující měsíc s chaotickou rotací a pórovitým, hustě rozrytým povrchem.' },
  iapetus: { d: 'Dvoutvárný měsíc: jeho přední polokoule je černá jako uhel a zadní zářivě bílá jako sníh. Rovníkový hřeben vysoký 20 km mu dává tvar vlašského ořechu.' },
  phoebe: { d: 'Zachycený, tmavý měsíc s retrográdní dráhou, který pravděpodobně vznikl v Kuiperově pásu; jeho prach zbarvuje jednu polokouli měsíce Iapetus.' },
  janus: { d: 'Sdílí téměř stejnou dráhu s měsícem Epimetheus; oba měsíce si každé čtyři roky vymění dráhy.' },
  prometheus: { d: 'Pastýřský měsíc, který tvaruje vnitřní okraj prstence F Saturnu.' },
  atlas: { d: 'Měsíc ve tvaru létajícího talíře na okraji prstence A.' },
  pan: { d: 'Měsíc „ravioli“, který udržuje čistou Enckeovu mezeru v prstenci A Saturnu.' },
  helene: { d: 'Trojský souputník měsíce Dione, který ho předchází o 60°.' },
  miranda: { d: 'Měsíc jako záplatovaná pokrývka s nejdramatičtějším terénem ve Sluneční soustavě: 20 km vysoké útesy (Verona Rupes) a obří rýhované „koróny“.' },
  titania: { d: 'Největší měsíc Uranu, pojmenovaný po královně víl ze Snu noci svatojánské.' },
  triton: {
    d: 'Zachycený objekt Kuiperova pásu obíhající zpětně, s dusíkovými gejzíry, růžovou jižní polární čepičkou a nejchladnějším naměřeným povrchem (38 K) ze všech světů navštívených sondami.',
    f: ['Jeho retrográdní dráha se zmenšuje; za asi 3,6 miliardy let se rozpadne na prstenec.'],
  },
  nereid: { d: 'Má jednu z nejvýstřednějších drah ze všech měsíců (e = 0,75).' },
  proteus: { d: 'Druhý největší měsíc Neptunu a téměř tak velký, jak jen gravitace dovolí nekulovému tělesu.' },
  charon: { d: 'Průměr má poloviční oproti Plutu: obě tělesa jsou vzájemně slapově vázaná a obíhají barycentrum ležící v prostoru mezi nimi.' },
  halley: {
    d: 'Nejslavnější periodická kometa: vrací se každých ~76 let a je zaznamenávána od roku 240 př. n. l. Poslední přísluní 9. února 1986, příští: 28. července 2061.',
    f: ['Zpětná dráha skloněná o 162° k ekliptice.', 'Nyní je poblíž odsluní, za dráhou Neptunu.'],
  },
  'hale-bopp': { d: 'Jedna z nejjasnějších a nejpozorovanějších komet 20. století, viditelná pouhým okem po dobu 18 měsíců. Její jádro měří asi 60 km, na kometu obrovské.' },
  hyakutake: { d: 'Velká kometa, která v březnu 1996 prošla jen 0,1 AU od Země; její ohon se táhl přes 100° oblohy.' },
  encke: { d: 'Nejkratší známá oběžná doba mezi jasnými kometami (3,3 roku). Mateřské těleso meteorických rojů Tauridy.' },
  '67p': { d: 'Kometa ve tvaru gumové kachničky, kolem níž kroužila sonda Rosetta (ESA, 2014–2016) a na jejíž povrch vysadila přistávací modul Philae — první měkké přistání na kometě.' },
  'swift-tuttle': { d: 'Mateřské těleso meteorického roje Perseid. S 26 km je největším objektem, který pravidelně prolétá v blízkosti Země.' },
  neowise: { d: 'Velkolepá kometa viditelná pouhým okem v červenci 2020. Vrátí se asi za 6 800 let.' },
  'tsuchinshan-atlas': { d: 'Kandidátka na „kometu století“ z října 2024; pohybuje se po téměř parabolické dráze a možná se nikdy nevrátí.' },
  'tempel-tuttle': { d: 'Mateřské těleso meteorických bouří Leonid; oběžná doba 33 let.' },
  oumuamua: { d: 'První potvrzený mezihvězdný návštěvník (2017), převalující se protáhlé těleso, které Sluneční soustavou proletělo rychlostí 26 km/s v nekonečnu a bez viditelného ohonu mírně zrychlilo.' },
  borisov: { d: 'První mezihvězdná kometa, kterou v roce 2019 objevil amatérský astronom Gennadij Borisov.' },
  '3i-atlas': { d: 'Třetí potvrzený mezihvězdný objekt, objevený v červenci 2025; vůči Slunci se pohybuje rychlostí ~58 km/s a pravděpodobně vznikl u jiné hvězdy před miliardami let.' },
  voyager1: {
    d: 'Nejvzdálenější lidmi vyrobený objekt, který opouští Sluneční soustavu rychlostí 17 km/s. Heliopauzu překročil v roce 2012, stále vysílá a veze Zlatou desku.',
    f: ['Na vzdálenost jednoho světelného dne od Země se dostane koncem roku 2026.', 'K jiné hvězdě (Gliese 445) se nejvíc přiblíží za ~40 000 let.'],
  },
  voyager2: { d: 'Jediná kosmická sonda, která navštívila Uran (1986) a Neptun (1989). Do mezihvězdného prostoru vstoupila v roce 2018.' },
  pioneer10: { d: 'První sonda, která proletěla pásem planetek a minula Jupiter. Kontakt byl ztracen v roce 2003.' },
  pioneer11: { d: 'První sonda, která minula Saturn (1979). Kontakt byl ztracen v roce 1995.' },
  newhorizons: { d: 'V červenci 2015 minula Pluto a 1. ledna 2019 objekt Kuiperova pásu Arrokoth; nyní zkoumá vnější heliosféru.' },
  parker: { d: 'Nejrychlejší lidmi vyrobený objekt: v přísluní dosahuje 192 km/s ve výšce 6,1 mil. km nad povrchem Slunce a prolétá sluneční korónou.' },
  'solar-orbiter': { d: 'Mise ESA a NASA, která poprvé zobrazuje póly Slunce.' },
  jwst: {
    d: 'Nejvýkonnější vesmírný dalekohled, jaký kdy vznikl: 6,5 m velké zrcadlo z berylia pokrytého zlatem pozoruje infračervené záření za slunečním štítem o velikosti tenisového kurtu.',
    f: ['Obíhá kolem bodu L2 soustavy Slunce–Země, 1,5 mil. km od Země.', 'Jeho přístroje jsou chlazeny pod 50 K.'],
  },
  soho: { d: 'Společná sluneční observatoř ESA a NASA v bodě L1 soustavy Slunce–Země, která Slunce nepřetržitě sleduje už 30 let a objevila přes 5 000 komet.' },
  gaia: { d: 'Astrometrická mise ESA, která zmapovala polohy a pohyby téměř dvou miliard hvězd — základ moderní galaktické astronomie.' },
  iss: {
    d: 'Největší stavba, jaká kdy vznikla ve vesmíru: pilotovaná laboratoř, která je trvale obydlena od listopadu 2000. Zemi obletí za 92 minut.',
    f: ['Pohybuje se rychlostí 7,66 km/s — 16 východů a západů Slunce za den.', 'Měří 109 m, přibližně jako fotbalové hřiště.'],
  },
  tiangong: { d: 'Čínská modulární vesmírná stanice, v provozu od roku 2022.' },
  hubble: {
    d: 'Dalekohled vypuštěný v roce 1990 provedl přes 1,5 milionu pozorování a pomohl stanovit stáří vesmíru na 13,8 miliardy let.',
    f: ['Obíhá jednou za 95 minut.', 'Jeho 2,4 m velké zrcadlo mělo při startu proslulou vadu a v roce 1993 bylo opraveno.'],
  },
  chandra: { d: 'Rentgenový dalekohled NASA na vysoce eliptické 64hodinové dráze, která ho zavádí do třetiny vzdálenosti k Měsíci.' },
  tess: { d: 'Družice TESS (Transiting Exoplanet Survey Satellite) na 13,7denní dráze v rezonanci 2 : 1 s Měsícem.' },
  vanguard1: { d: 'Vypuštěna v roce 1958, je nejstarším člověkem vyrobeným objektem, který je dosud na oběžné dráze.' },
  goes16: { d: 'Meteorologická družice na geostacionární oběžné dráze nad Amerikou.' },
  meteosat: { d: 'Evropská geostacionární meteorologická družice.' },
  'gps-iif': { d: 'Jedna z asi 31 družic konstelace GPS, která obíhá jednou za 11 h 58 min ve výšce 20 200 km.' },
  lro: { d: 'Od roku 2009 mapuje Měsíc ve vysokém rozlišení.' },
  mro: { d: 'Její kamera HiRISE dokáže na povrchu Marsu rozlišit objekty o velikosti 30 cm.' },
  maven: { d: 'Zkoumá, jak Mars přišel o svou atmosféru.' },
  'juno-probe': { d: 'Obíhá Jupiter po polární dráze, každých 33 dní se otře o vrcholky mraků a mapuje gravitaci, magnetické pole a hluboké nitro planety.' },
  'sgr-a-star': {
    d: 'Supermasivní černá díra ve středu Mléčné dráhy. Hvězdy jako S2 kolem ní víří s oběžnou dobou 16 let rychlostí 3 % rychlosti světla; Event Horizon Telescope v roce 2022 zobrazil její stín.',
    f: ['Její horizont událostí měří asi 12 mil. km — méně než dráha Merkuru.', 'Objevena jako rádiový zdroj v roce 1974; Nobelova cena za fyziku 2020 (Genzel a Ghez).'],
  },
  'cyg-x-1': {
    d: 'První široce uznaná černá díra (1971). Pohlcuje plyn z modrého veleobra HDE 226868, který se tím rozžhaví v zářivý akreční disk vyzařující rentgenové záření.',
    f: ['Předmět slavné sázky Hawkinga s Thornem z roku 1974.'],
  },
  'm87-star': { d: 'První kdy zobrazená černá díra (Event Horizon Telescope, 2019): obr o hmotnosti 6,5 miliardy Sluncí, jehož stín je větší než celá naše Sluneční soustava a který vystřeluje výtrysk dlouhý 5 000 světelných let.' },
  'ton-618': { d: 'Jedna z nejhmotnějších známých černých děr, která pohání hyperzářivý kvasar. Její horizont událostí má rozměr asi 1 300 AU — několikanásobek velikosti naší Sluneční soustavy.' },
  '3c-273': { d: 'První kdy identifikovaný kvasar (1963) a opticky nejjasnější na naší obloze; září jako 4 biliony Sluncí.' },
  'gaia-bh1': { d: 'Nejbližší známá černá díra, objevená v roce 2022 podle kolísání polohy průvodce podobného Slunci. Nic nepohlcuje, a je proto skutečně temná.' },
  'gaia-bh3': { d: 'Nejhmotnější známá černá díra hvězdné hmotnosti v Mléčné dráze (33 M☉), oznámená v roce 2024.' },
  'crab-pulsar': { d: 'Neutronová hvězda o průměru 12 km, která zbyla po supernově z roku 1054, otáčí se 30krát za sekundu a svým relativistickým větrem rozsvěcuje Krabí mlhovinu.' },
  'vela-pulsar': { d: 'Mladá neutronová hvězda ve zbytku supernovy Vela, která se otáčí 11krát za sekundu; občas „zaškobrtne“ (glitch) a náhle zrychlí.' },
  'psr-b1919': { d: 'Vůbec první objevený pulzar (Jocelyn Bell Burnellová, 1967) — tak pravidelný, že mu žertem přezdívali LGM-1, „Little Green Men“ (zelení mužíčci).' },
};

/** Thousands groups and "number + unit" pairs get a non-breaking space, so a figure never splits across lines. */
function nb(s: string): string {
  return s
    .replace(/(\d) (\d{3})(?!\d)/g, '$1 $2')
    .replace(/(\d) (km\/h|km\/s|km|cm|m|K|AU|min|h|s|kg|%|M☉|mil\. km)(?![\p{L}])/gu, '$1 $2');
}

export const CS_TEXT: Record<string, CsText> = Object.fromEntries(
  Object.entries(RAW).map(([id, v]) => [id, { d: v.d && nb(v.d), f: v.f?.map(nb) }]),
);
