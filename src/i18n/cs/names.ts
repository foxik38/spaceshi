/**
 * Czech names of objects. Only names that actually differ from the English/Latin ones are listed; everything else
 * (most moons, catalogue designations, IAU star names) is used unchanged, as Czech astronomy does.
 * Minor planets follow the Czech convention "(433) Eros".
 */

/** Body id → Czech display name. */
export const CS_BODY_NAMES: Record<string, string> = {
  sun: 'Slunce', mercury: 'Merkur', venus: 'Venuše', earth: 'Země', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
  uranus: 'Uran', neptune: 'Neptun', pluto: 'Pluto',
  vesta: '(4) Vesta', pallas: '(2) Pallas', hygiea: '(10) Hygiea', interamnia: '(704) Interamnia', juno: '(3) Juno', davida: '(511) Davida',
  psyche: '(16) Psyche', eros: '(433) Eros', ida: '(243) Ida', gaspra: '(951) Gaspra', mathilde: '(253) Mathilde', lutetia: '(21) Lutetia',
  itokawa: '(25143) Itokawa', ryugu: '(162173) Ryugu', bennu: '(101955) Bennu', apophis: '(99942) Apophis', didymos: '(65803) Didymos',
  phaethon: '(3200) Phaethon', chiron: '(2060) Chiron', chariklo: '(10199) Chariklo', arrokoth: '(486958) Arrokoth',
  moon: 'Měsíc', ganymede: 'Ganymed', nereid: 'Nereida',
  halley: 'Halleyova kometa (1P/Halley)', hyakutake: 'C/1996 B2 (Hjakutake)', encke: 'Enckeova kometa (2P/Encke)',
  '67p': '67P/Čurjumov–Gerasimenko', 'swift-tuttle': '109P/Swift–Tuttle',
  jwst: 'Vesmírný dalekohled Jamese Webba', iss: 'Mezinárodní kosmická stanice (ISS)', tiangong: 'Vesmírná stanice Tchien-kung (Tiangong)',
  hubble: 'Hubbleův vesmírný dalekohled', chandra: 'Rentgenová observatoř Chandra', parker: 'Parker Solar Probe',
  'crab-pulsar': 'Krabí pulzar (PSR B0531+21)', 'vela-pulsar': 'Pulzar Vela',
};

/** Extra search terms in Czech (in addition to the displayed name). */
export const CS_BODY_ALIASES: Record<string, string[]> = {
  sun: ['Sol'], earth: ['Terra', 'Modrá planeta'], moon: ['Luna'], halley: ['Halley'], iss: ['ISS'], hubble: ['HST'],
  'sgr-a-star': ['Střed Galaxie', 'Střed Mléčné dráhy'], 'oumuamua': ['Oumuamua'], 'jwst': ['Webb', 'JWST'],
};

/** IAU proper names of stars that have a distinct Czech form. */
export const CS_STAR_NAMES: Record<string, string> = {
  "Barnard's Star": 'Barnardova hvězda', "Van Maanen's Star": 'Van Maanenova hvězda', "Luyten's Star": 'Luytenova hvězda',
  Sirius: 'Sírius', Procyon: 'Prokyon', Polaris: 'Polárka', Arcturus: 'Arktur', Capella: 'Kapella', Betelgeuse: 'Betelgeuze',
  Spica: 'Spika', Canopus: 'Kanopus', Alcyone: 'Alkyone', Electra: 'Elektra',
};

/** OpenNGC common names of deep-sky objects. */
export const CS_DSO_NAMES: Record<string, string> = {
  '30 Dor Cluster': 'Hvězdokupa 30 Doradus', '47 Tuc Cluster': 'Hvězdokupa 47 Tucanae',
  'Andromeda Galaxy': 'Galaxie v Andromedě', 'Antennae Galaxies': 'Galaxie Tykadla', 'Barbell Nebula': 'Mlhovina Malá činka',
  "Barnard's Galaxy": 'Barnardova galaxie', "Barnard's Merope Nebula": 'Barnardova mlhovina u Merope', 'Bear Claw Nebula': 'Mlhovina Medvědí dráp',
  Beehive: 'Jesle', 'Black Eye Galaxy': 'Galaxie Černé oko', 'Blinking Planetary': 'Blikající planetární mlhovina',
  'Blue Flash Nebula': 'Mlhovina Modrý záblesk', 'Blue Planetary': 'Modrá planetární mlhovina', "Bode's Galaxy": 'Bodeho galaxie',
  'Bow-Tie nebula': 'Mlhovina Motýlek', 'Box Nebula': 'Mlhovina Krabice', "Brocchi's Cluster": 'Brocchiho hvězdokupa',
  'Bubble Nebula': 'Bublinová mlhovina', 'Bug Nebula': 'Mlhovina Brouk', 'Butterfly Cluster': 'Motýlí hvězdokupa',
  'Butterfly Galaxies': 'Motýlí galaxie', 'California Nebula': 'Kalifornská mlhovina', 'Carina Nebula': 'Mlhovina v Lodním kýlu',
  "Caroline's Cluster": 'Karolinina hvězdokupa', "Cat's Eye Nebula": 'Mlhovina Kočičí oko', 'Cave Nebula': 'Mlhovina Jeskyně',
  'Checkmark Nebula': 'Mlhovina Fajfka', 'Christmas Tree Cluster': 'Hvězdokupa Vánoční stromek', 'Cigar Galaxy': 'Doutníková galaxie',
  'Circinus Galaxy': 'Galaxie v Kružítku', 'Coalsack Cluster': 'Hvězdokupa v Uhelném pytli', 'Coalsack Nebula': 'Mlhovina Uhelný pytel',
  'Cocoon Galaxy': 'Galaxie Kokon', 'Cocoon Nebula': 'Mlhovina Kokon', "Coddington's Nebula": 'Coddingtonova mlhovina',
  'Coma Pinwheel': 'Větrník ve Vlasech Bereniky', 'Coma Star Cluster': 'Hvězdokupa ve Vlasech Bereniky',
  "Copeland's Blue Snowball": 'Copelandova modrá sněhová koule', 'Crab Nebula': 'Krabí mlhovina', 'Crescent Nebula': 'Srpková mlhovina',
  'Double Cluster': 'Dvojitá hvězdokupa v Perseu', 'Dumbbell Nebula': 'Mlhovina Činka', 'Eagle Nebula': 'Mlhovina Orel',
  'Eastern Veil': 'Východní závoj', 'Eight-Burst Nebula': 'Mlhovina Osm záblesků', 'Eskimo Nebula': 'Mlhovina Eskymák', Eyes: 'Oči',
  'Fireworks Galaxy': 'Galaxie Ohňostroj', 'Flame Nebula': 'Mlhovina Plamen', 'Flaming Star Nebula': 'Mlhovina Planoucí hvězda',
  'Fornax Dwarf Cluster 3': 'Trpasličí hvězdokupa 3 v Peci', 'Fornax Dwarf Spheroidal': 'Trpasličí sféroidní galaxie v Peci',
  'Foxhead Cluster': 'Hvězdokupa Liščí hlava', 'Great Bird Cluster': 'Hvězdokupa Velký pták', 'Great Orion Nebula': 'Velká mlhovina v Orionu',
  'Helix Galaxy': 'Galaxie Šroubovice', 'Helix Nebula': 'Mlhovina Šroubovice', 'Hercules Globular Cluster': 'Kulová hvězdokupa v Herkulovi',
  "Herschel's Jewel Box": 'Herschelova šperkovnice', "Hind's Nebula": 'Hindova mlhovina', 'Horsehead Nebula': 'Mlhovina Koňská hlava',
  "Hubble's Nebula": 'Hubbleova mlhovina', Hyades: 'Hyády', 'Iris Nebula': 'Mlhovina Kosatec', "Jupiter's Ghost Nebula": 'Mlhovina Jupiterův duch',
  'Lagoon Nebula': 'Mlhovina Laguna', 'Large Magellanic Cloud': 'Velký Magellanův oblak', 'Leo I': 'Lev I', 'Little Gem': 'Malý drahokam',
  'Little Gem Nebula': 'Mlhovina Malý drahokam', 'Little Ghost Nebula': 'Mlhovina Malý duch', 'Lower Sword': 'Dolní meč',
  'Maia Nebula': 'Mlhovina Maia', "Mairan's Nebula": 'Mairanova mlhovina', 'Medusa Galaxy Merger': 'Splývající galaxie Medúza',
  'Merope Nebula': 'Mlhovina Merope', 'Mice Galaxy': 'Galaxie Myši', 'Miniature Spiral': 'Miniaturní spirála',
  'Monkey Head Nebula': 'Mlhovina Opičí hlava', 'Needle Galaxy': 'Galaxie Jehla', 'North America Nebula': 'Mlhovina Severní Amerika',
  'Owl Cluster': 'Hvězdokupa Sova', 'Owl Nebula': 'Mlhovina Sova', 'Pearl Cluster': 'Perlová hvězdokupa', 'Pelican Nebula': 'Mlhovina Pelikán',
  'Pencil Nebula': 'Mlhovina Tužka', 'Phantom Streak Nebula': 'Mlhovina Přízračná šmouha', Pleiades: 'Plejády', "Ptolemy's Cluster": 'Ptolemaiova hvězdokupa',
  'Red Spider Nebula': 'Mlhovina Rudý pavouk', 'Rim Nebula': 'Mlhovina Okraj', 'Ring Nebula': 'Prstencová mlhovina',
  'Rosette A': 'Rozeta A', 'Rosette B': 'Rozeta B', 'Rosette Nebula': 'Mlhovina Rozeta', 'Saturn Nebula': 'Mlhovina Saturn',
  'Sculptor Dwarf Elliptical': 'Trpasličí eliptická galaxie v Sochaři', 'Sculptor Filament': 'Vlákno v Sochaři',
  'Sextans Dwarf Spheroidal': 'Trpasličí sféroidní galaxie v Sextantu', "Seyfert's Sextet": 'Seyfertovo sextet',
  'Small Magellanic Cloud': 'Malý Magellanův oblak', 'Small Sgr Star Cloud': 'Malý oblak hvězd ve Střelci', 'Sombrero Galaxy': 'Galaxie Sombrero',
  'Southern Pinwheel Galaxy': 'Jižní Větrník', 'Spindle Galaxy': 'Galaxie Vřeteno', "Stephan's Quintet": 'Stephanův kvintet',
  'Sunflower Galaxy': 'Galaxie Slunečnice', 'Toby Jug Nebula': 'Mlhovina Džbánek', 'Triangulum Galaxy': 'Galaxie v Trojúhelníku',
  'Trifid Nebula': 'Mlhovina Trifid', 'Umbrella Galaxy': 'Galaxie Deštník', 'Upper Sword': 'Horní meč', 'Veil Nebula': 'Závojová mlhovina',
  'Virgo Galaxy': 'Galaxie v Panně', 'Whale Galaxy': 'Galaxie Velryba', 'Whirlpool Galaxy': 'Vírová galaxie',
  'Wishing Well Cluster': 'Hvězdokupa Studna přání', 'Wolf-Lundmark-Melotte': 'Wolf–Lundmark–Melotte',
  'chi Persei Cluster': 'Hvězdokupa χ Persei', 'h Persei Cluster': 'Hvězdokupa h Persei', 'lam Cen Nebula': 'Mlhovina λ Centauri',
  'omi Per Cloud': 'Oblak ο Persei', 'omi Vel Cluster': 'Hvězdokupa ο Velorum', 'rho Oph Nebula': 'Mlhovina ρ Ophiuchi',
  'tet Car Cluster': 'Hvězdokupa θ Carinae', 'the Guitar': 'Kytara', 'the Running Man Nebula': 'Mlhovina Běžící muž',
  'the War and Peace Nebula': 'Mlhovina Válka a mír', 'the Witch Head Nebula': 'Mlhovina Hlava čarodějnice',
};

/** IAU constellation abbreviation → [nominative, genitive] in Czech ("v souhvězdí Velkého psa"). */
export const CS_CONSTELLATIONS: Record<string, [string, string]> = {
  And: ['Andromeda', 'Andromedy'], Ant: ['Vývěva', 'Vývěvy'], Aps: ['Rajka', 'Rajky'], Aqr: ['Vodnář', 'Vodnáře'], Aql: ['Orel', 'Orla'],
  Ara: ['Oltář', 'Oltáře'], Ari: ['Beran', 'Berana'], Aur: ['Vozka', 'Vozky'], Boo: ['Pastýř', 'Pastýře'], Cae: ['Rytecké dláto', 'Ryteckého dláta'],
  Cam: ['Žirafa', 'Žirafy'], Cnc: ['Rak', 'Raka'], CVn: ['Honicí psi', 'Honicích psů'], CMa: ['Velký pes', 'Velkého psa'], CMi: ['Malý pes', 'Malého psa'],
  Cap: ['Kozoroh', 'Kozoroha'], Car: ['Kýl', 'Kýlu'], Cas: ['Kasiopeja', 'Kasiopeji'], Cen: ['Kentaur', 'Kentaura'], Cep: ['Cefeus', 'Cefea'],
  Cet: ['Velryba', 'Velryby'], Cha: ['Chameleon', 'Chameleona'], Cir: ['Kružítko', 'Kružítka'], Col: ['Holub', 'Holuba'],
  Com: ['Vlasy Bereniky', 'Vlasů Bereniky'], CrA: ['Jižní koruna', 'Jižní koruny'], CrB: ['Severní koruna', 'Severní koruny'],
  Crv: ['Havran', 'Havrana'], Crt: ['Pohár', 'Poháru'], Cru: ['Jižní kříž', 'Jižního kříže'], Cyg: ['Labuť', 'Labutě'], Del: ['Delfín', 'Delfína'],
  Dor: ['Zlatá ryba', 'Zlaté ryby'], Dra: ['Drak', 'Draka'], Equ: ['Malý kůň', 'Malého koně'], Eri: ['Eridanus', 'Eridanu'], For: ['Pec', 'Pece'],
  Gem: ['Blíženci', 'Blíženců'], Gru: ['Jeřáb', 'Jeřábu'], Her: ['Herkules', 'Herkula'], Hor: ['Hodiny', 'Hodin'], Hya: ['Hydra', 'Hydry'],
  Hyi: ['Malý vodní had', 'Malého vodního hada'], Ind: ['Indián', 'Indiána'], Lac: ['Ještěrka', 'Ještěrky'], Leo: ['Lev', 'Lva'],
  LMi: ['Malý lev', 'Malého lva'], Lep: ['Zajíc', 'Zajíce'], Lib: ['Váhy', 'Vah'], Lup: ['Vlk', 'Vlka'], Lyn: ['Rys', 'Rysa'], Lyr: ['Lyra', 'Lyry'],
  Men: ['Tabulová hora', 'Tabulové hory'], Mic: ['Mikroskop', 'Mikroskopu'], Mon: ['Jednorožec', 'Jednorožce'], Mus: ['Moucha', 'Mouchy'],
  Nor: ['Pravítko', 'Pravítka'], Oct: ['Oktant', 'Oktantu'], Oph: ['Hadonoš', 'Hadonoše'], Ori: ['Orion', 'Orionu'], Pav: ['Páv', 'Páva'],
  Peg: ['Pegas', 'Pegasa'], Per: ['Perseus', 'Persea'], Phe: ['Fénix', 'Fénixe'], Pic: ['Malíř', 'Malíře'], Psc: ['Ryby', 'Ryb'],
  PsA: ['Jižní ryba', 'Jižní ryby'], Pup: ['Lodní záď', 'Lodní zádě'], Pyx: ['Kompas', 'Kompasu'], Ret: ['Síť', 'Sítě'], Sge: ['Šíp', 'Šípu'],
  Sgr: ['Střelec', 'Střelce'], Sco: ['Štír', 'Štíra'], Scl: ['Sochař', 'Sochaře'], Sct: ['Štít', 'Štítu'], Ser: ['Had', 'Hada'],
  Sex: ['Sextant', 'Sextantu'], Tau: ['Býk', 'Býka'], Tel: ['Dalekohled', 'Dalekohledu'], Tri: ['Trojúhelník', 'Trojúhelníku'],
  TrA: ['Jižní trojúhelník', 'Jižního trojúhelníku'], Tuc: ['Tukan', 'Tukana'], UMa: ['Velká medvědice', 'Velké medvědice'],
  UMi: ['Malá medvědice', 'Malé medvědice'], Vel: ['Plachty', 'Plachet'], Vir: ['Panna', 'Panny'], Vol: ['Létající ryba', 'Létající ryby'],
  Vul: ['Lištička', 'Lištičky'],
};

/** Names of the 88 constellations as drawn in the sky (labels of the constellation layer): English → Czech. */
export const CS_CONSTELLATION_LABELS: Record<string, string> = {
  Andromeda: 'Andromeda', Antlia: 'Vývěva', Apus: 'Rajka', Aquarius: 'Vodnář', Aquila: 'Orel', Ara: 'Oltář', Aries: 'Beran', Auriga: 'Vozka',
  Bootes: 'Pastýř', 'Boötes': 'Pastýř', Caelum: 'Rytecké dláto', Camelopardalis: 'Žirafa', Cancer: 'Rak', 'Canes Venatici': 'Honicí psi',
  'Canis Major': 'Velký pes', 'Canis Minor': 'Malý pes', Capricornus: 'Kozoroh', Carina: 'Kýl', Cassiopeia: 'Kasiopeja', Centaurus: 'Kentaur',
  Cepheus: 'Cefeus', Cetus: 'Velryba', Chamaeleon: 'Chameleon', Circinus: 'Kružítko', Columba: 'Holub', 'Coma Berenices': 'Vlasy Bereniky',
  'Corona Australis': 'Jižní koruna', 'Corona Borealis': 'Severní koruna', Corvus: 'Havran', Crater: 'Pohár', Crux: 'Jižní kříž', Cygnus: 'Labuť',
  Delphinus: 'Delfín', Dorado: 'Zlatá ryba', Draco: 'Drak', Equuleus: 'Malý kůň', Eridanus: 'Eridanus', Fornax: 'Pec', Gemini: 'Blíženci',
  Grus: 'Jeřáb', Hercules: 'Herkules', Horologium: 'Hodiny', Hydra: 'Hydra', Hydrus: 'Malý vodní had', Indus: 'Indián', Lacerta: 'Ještěrka',
  Leo: 'Lev', 'Leo Minor': 'Malý lev', Lepus: 'Zajíc', Libra: 'Váhy', Lupus: 'Vlk', Lynx: 'Rys', Lyra: 'Lyra', Mensa: 'Tabulová hora',
  Microscopium: 'Mikroskop', Monoceros: 'Jednorožec', Musca: 'Moucha', Norma: 'Pravítko', Octans: 'Oktant', Ophiuchus: 'Hadonoš', Orion: 'Orion',
  Pavo: 'Páv', Pegasus: 'Pegas', Perseus: 'Perseus', Phoenix: 'Fénix', Pictor: 'Malíř', Pisces: 'Ryby', 'Piscis Austrinus': 'Jižní ryba',
  Puppis: 'Lodní záď', Pyxis: 'Kompas', Reticulum: 'Síť', Sagitta: 'Šíp', Sagittarius: 'Střelec', Scorpius: 'Štír', Sculptor: 'Sochař',
  Scutum: 'Štít', Serpens: 'Had', Sextans: 'Sextant', Taurus: 'Býk', Telescopium: 'Dalekohled', Triangulum: 'Trojúhelník',
  'Triangulum Australe': 'Jižní trojúhelník', Tucana: 'Tukan', 'Ursa Major': 'Velká medvědice', 'Ursa Minor': 'Malá medvědice',
  Vela: 'Plachty', Virgo: 'Panna', Volans: 'Létající ryba', Vulpecula: 'Lištička',
};
