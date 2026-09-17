const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Connection liveness (ping/pong heartbeat) ---------------------------
// Without this, a "zombie" connection — a phone that got backgrounded, a
// wifi-to-cellular handoff, a flaky connection that never sends a proper
// close/FIN — can sit in room.players with player.ws still set forever.
// Every "wait for everyone" gate (Daily Double answers, roll call ready-ups)
// filters on player.ws being truthy to decide who still counts, so a zombie
// connection that looks connected but will never send anything again could
// make the whole table wait on someone who has effectively vanished, with
// no way to tell the difference from "they're just still thinking." This
// pings every open connection on an interval; anything that didn't answer
// the previous ping gets forcibly terminated, which fires that socket's
// normal 'close' handler below and lets the game correctly notice they're
// gone and move on.
const HEARTBEAT_INTERVAL_MS = 20000;
function heartbeatPong() { this.isAlive = true; }
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);
wss.on('close', () => clearInterval(heartbeatTimer));

// --- Real Switchagories content, ported from the single-device build. ---
// Order matters: it lines up with CATEGORY_WHEEL (and the wheel's 6 wedges)
// on the client, wedge-c1..c6 in this same sequence.
const CATEGORY_WHEEL = [
  { cat: 'Geography', icon: '🌍' },
  { cat: 'Science', icon: '🔬' },
  { cat: 'History', icon: '🏛️' },
  { cat: 'Pop Culture', icon: '📺' },
  { cat: 'Sports', icon: '🏆' },
  { cat: 'Entertainment', icon: '🎬' },
];

const MAIN_QUESTIONS = [
  { cat: 'Geography', diff: 'easy', q: 'Which country has the largest total land area in the world?', choices: ['Russia', 'Canada', 'China', 'United States'], correct: 0 },
  { cat: 'Geography', diff: 'easy', q: 'What is the largest ocean on Earth?', choices: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean'], correct: 1 },
  { cat: 'Geography', diff: 'easy', q: 'What is the tallest mountain above sea level?', choices: ['K2', 'Denali', 'Mount Everest', 'Mount Kilimanjaro'], correct: 2 },
  { cat: 'Geography', diff: 'easy', q: 'What is the capital city of France?', choices: ['Lyon', 'Marseille', 'Nice', 'Paris'], correct: 3 },
  { cat: 'Geography', diff: 'easy', q: 'What is the capital city of Japan?', choices: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama'], correct: 0 },
  { cat: 'Geography', diff: 'easy', q: 'Which is the smallest country in the world by area?', choices: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'], correct: 1 },
  { cat: 'Geography', diff: 'easy', q: 'Which continent has the greatest number of countries?', choices: ['Asia', 'Europe', 'Africa', 'South America'], correct: 2 },
  { cat: 'Geography', diff: 'easy', q: 'What is the largest hot desert in the world?', choices: ['Kalahari Desert', 'Gobi Desert', 'Arabian Desert', 'Sahara Desert'], correct: 3 },
  { cat: 'Geography', diff: 'easy', q: 'What is the capital city of Australia?', choices: ['Canberra', 'Sydney', 'Melbourne', 'Brisbane'], correct: 0 },
  { cat: 'Geography', diff: 'easy', q: 'The Great Wall is located in which country?', choices: ['Mongolia', 'China', 'North Korea', 'Vietnam'], correct: 1 },
  { cat: 'Geography', diff: 'easy', q: 'The Panama Canal connects the Pacific Ocean to which other ocean?', choices: ['Indian Ocean', 'Arctic Ocean', 'Atlantic Ocean', 'Southern Ocean'], correct: 2 },
  { cat: 'Geography', diff: 'easy', q: 'What is the capital city of Canada?', choices: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'], correct: 3 },
  { cat: 'Geography', diff: 'easy', q: 'What is the largest island in the world?', choices: ['Greenland', 'Madagascar', 'Borneo', 'New Guinea'], correct: 0 },
  { cat: 'Geography', diff: 'easy', q: 'How many continents are there in the traditional model?', choices: ['5', '7', '6', '8'], correct: 1 },
  { cat: 'Geography', diff: 'medium', q: 'What is the capital city of Brazil?', choices: ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Salvador'], correct: 2 },
  { cat: 'Geography', diff: 'medium', q: 'What is the longest river in Asia?', choices: ['Yellow River', 'Mekong River', 'Ganges River', 'Yangtze River'], correct: 3 },
  { cat: 'Geography', diff: 'medium', q: 'Angel Falls, the world\'s highest uninterrupted waterfall, is located in which country?', choices: ['Venezuela', 'Brazil', 'Colombia', 'Guyana'], correct: 0 },
  { cat: 'Geography', diff: 'medium', q: 'Which strait separates Europe from Africa at its narrowest point?', choices: ['Strait of Hormuz', 'Strait of Gibraltar', 'Bosporus Strait', 'Strait of Dover'], correct: 1 },
  { cat: 'Geography', diff: 'medium', q: 'The Andes, the longest continental mountain range, run through which continent?', choices: ['North America', 'Africa', 'South America', 'Asia'], correct: 2 },
  { cat: 'Geography', diff: 'medium', q: 'Which African country was never colonized by a European power?', choices: ['Kenya', 'Nigeria', 'Ghana', 'Ethiopia'], correct: 3 },
  { cat: 'Geography', diff: 'medium', q: 'The Dead Sea lies on the border between Jordan and which other country?', choices: ['Israel', 'Egypt', 'Syria', 'Lebanon'], correct: 0 },
  { cat: 'Geography', diff: 'medium', q: 'What is the capital city of South Korea?', choices: ['Busan', 'Seoul', 'Incheon', 'Daegu'], correct: 1 },
  { cat: 'Geography', diff: 'medium', q: 'The Danube River empties into which sea?', choices: ['Adriatic Sea', 'Aegean Sea', 'Black Sea', 'Caspian Sea'], correct: 2 },
  { cat: 'Geography', diff: 'medium', q: 'What is the largest lake in the world by surface area?', choices: ['Lake Superior', 'Lake Victoria', 'Lake Baikal', 'Caspian Sea'], correct: 3 },
  { cat: 'Geography', diff: 'medium', q: 'The Great Barrier Reef lies off the coast of which country?', choices: ['Australia', 'Indonesia', 'Philippines', 'Fiji'], correct: 0 },
  { cat: 'Geography', diff: 'medium', q: 'Which city is the highest capital in the world by elevation?', choices: ['Quito', 'La Paz', 'Bogotá', 'Kathmandu'], correct: 1 },
  { cat: 'Geography', diff: 'medium', q: 'The Suez Canal connects the Mediterranean Sea to which other sea?', choices: ['Arabian Sea', 'Black Sea', 'Red Sea', 'Caspian Sea'], correct: 2 },
  { cat: 'Geography', diff: 'hard', q: 'Which country has the longest coastline in the world?', choices: ['Indonesia', 'Australia', 'Russia', 'Canada'], correct: 3 },
  { cat: 'Geography', diff: 'hard', q: 'What is the lowest point on Earth\'s land surface?', choices: ['Shores of the Dead Sea', 'Death Valley', 'Turpan Depression', 'Caspian Depression'], correct: 0 },
  { cat: 'Geography', diff: 'hard', q: 'The Prime Meridian passes through which district of London?', choices: ['Westminster', 'Greenwich', 'Kensington', 'Camden'], correct: 1 },
  { cat: 'Geography', diff: 'hard', q: 'Which two countries share the longest international land border in the world?', choices: ['Russia and China', 'Chile and Argentina', 'United States and Canada', 'Brazil and Bolivia'], correct: 2 },
  { cat: 'Geography', diff: 'hard', q: 'What is the deepest known point in the world\'s oceans?', choices: ['Puerto Rico Trench', 'Tonga Trench', 'Java Trench', 'Mariana Trench'], correct: 3 },
  { cat: 'Geography', diff: 'hard', q: 'What is the largest gulf in the world by area?', choices: ['Gulf of Mexico', 'Persian Gulf', 'Gulf of Alaska', 'Gulf of Aden'], correct: 0 },
  { cat: 'Geography', diff: 'hard', q: 'What is the deepest lake in Africa?', choices: ['Lake Victoria', 'Lake Tanganyika', 'Lake Malawi', 'Lake Chad'], correct: 1 },
  { cat: 'Geography', diff: 'hard', q: 'The Atacama Desert, one of the driest places on Earth, is located mainly in which country?', choices: ['Peru', 'Bolivia', 'Chile', 'Argentina'], correct: 2 },
  { cat: 'Geography', diff: 'hard', q: 'Which mountain range forms a natural boundary between Europe and Asia?', choices: ['Caucasus Mountains', 'Carpathian Mountains', 'Altai Mountains', 'Ural Mountains'], correct: 3 },
  { cat: 'Geography', diff: 'hard', q: 'Which country is the world\'s largest archipelago, made up of over 17,000 islands?', choices: ['Indonesia', 'Philippines', 'Japan', 'Malaysia'], correct: 0 },
  { cat: 'Geography', diff: 'hard', q: 'Along with Uzbekistan, which is the only other country in the world considered doubly landlocked?', choices: ['Switzerland', 'Liechtenstein', 'Austria', 'Luxembourg'], correct: 1 },
  { cat: 'Geography', diff: 'hard', q: 'What is the largest bay in the world by area?', choices: ['Hudson Bay', 'Bay of Biscay', 'Bay of Bengal', 'Gulf of Guinea'], correct: 2 },
  { cat: 'Geography', diff: 'hard', q: 'The Bering Strait separates Asia from which continent?', choices: ['Europe', 'Australia', 'South America', 'North America'], correct: 3 },
  { cat: 'Science', diff: 'easy', q: 'Which part of a cell is often called the powerhouse of the cell?', choices: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi apparatus'], correct: 0 },
  { cat: 'Science', diff: 'easy', q: 'What is the chemical symbol for the element gold?', choices: ['Ag', 'Au', 'Gd', 'Go'], correct: 1 },
  { cat: 'Science', diff: 'easy', q: 'Which planet in our solar system is closest to the Sun?', choices: ['Venus', 'Earth', 'Mercury', 'Mars'], correct: 2 },
  { cat: 'Science', diff: 'easy', q: 'What force causes objects to fall toward the ground?', choices: ['Magnetism', 'Friction', 'Inertia', 'Gravity'], correct: 3 },
  { cat: 'Science', diff: 'easy', q: 'How many chambers does a healthy human heart have?', choices: ['Four', 'Two', 'Three', 'Five'], correct: 0 },
  { cat: 'Science', diff: 'easy', q: 'Which is the largest ocean on Earth?', choices: ['Atlantic Ocean', 'Pacific Ocean', 'Indian Ocean', 'Arctic Ocean'], correct: 1 },
  { cat: 'Science', diff: 'easy', q: 'Which gas do plants absorb from the air during photosynthesis?', choices: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], correct: 2 },
  { cat: 'Science', diff: 'easy', q: 'What is the chemical formula for water?', choices: ['CO2', 'O2', 'NaCl', 'H2O'], correct: 3 },
  { cat: 'Science', diff: 'easy', q: 'What is the closest star to Earth?', choices: ['The Sun', 'Proxima Centauri', 'Alpha Centauri', 'Sirius'], correct: 0 },
  { cat: 'Science', diff: 'easy', q: 'Approximately how many bones are in the adult human skeleton?', choices: ['156', '206', '256', '106'], correct: 1 },
  { cat: 'Science', diff: 'easy', q: 'Which scientist developed the theory of general relativity?', choices: ['Isaac Newton', 'Niels Bohr', 'Albert Einstein', 'Galileo Galilei'], correct: 2 },
  { cat: 'Science', diff: 'easy', q: 'What unit is used to measure electric current?', choices: ['Volt', 'Watt', 'Ohm', 'Ampere'], correct: 3 },
  { cat: 'Science', diff: 'easy', q: 'What is the largest organ in the human body?', choices: ['Skin', 'Liver', 'Lungs', 'Heart'], correct: 0 },
  { cat: 'Science', diff: 'easy', q: 'Which layer of the Earth lies directly beneath the crust?', choices: ['Outer core', 'Mantle', 'Inner core', 'Lithosphere'], correct: 1 },
  { cat: 'Science', diff: 'medium', q: 'Which gas makes up about 78 percent of Earth\'s atmosphere?', choices: ['Oxygen', 'Argon', 'Nitrogen', 'Carbon dioxide'], correct: 2 },
  { cat: 'Science', diff: 'medium', q: 'Which scientist formulated the three laws of motion?', choices: ['Albert Einstein', 'James Clerk Maxwell', 'Johannes Kepler', 'Isaac Newton'], correct: 3 },
  { cat: 'Science', diff: 'medium', q: 'Which planet is famous for its prominent ring system?', choices: ['Saturn', 'Jupiter', 'Uranus', 'Neptune'], correct: 0 },
  { cat: 'Science', diff: 'medium', q: 'What is it called when plants release water vapor through their leaves?', choices: ['Respiration', 'Transpiration', 'Photosynthesis', 'Osmosis'], correct: 1 },
  { cat: 'Science', diff: 'medium', q: 'Which organ in the human body produces insulin?', choices: ['Liver', 'Kidney', 'Pancreas', 'Spleen'], correct: 2 },
  { cat: 'Science', diff: 'medium', q: 'What pH value indicates a neutral solution?', choices: ['0', '10', '14', '7'], correct: 3 },
  { cat: 'Science', diff: 'medium', q: 'What type of rock forms when magma or lava cools and solidifies?', choices: ['Igneous', 'Sedimentary', 'Metamorphic', 'Composite'], correct: 0 },
  { cat: 'Science', diff: 'medium', q: 'Approximately what is the speed of light in a vacuum?', choices: ['150,000 km/s', '300,000 km/s', '450,000 km/s', '600,000 km/s'], correct: 1 },
  { cat: 'Science', diff: 'medium', q: 'Which scientist is credited with discovering penicillin?', choices: ['Louis Pasteur', 'Robert Koch', 'Alexander Fleming', 'Jonas Salk'], correct: 2 },
  { cat: 'Science', diff: 'medium', q: 'What is the name of the galaxy that contains our solar system?', choices: ['Andromeda', 'Triangulum', 'Whirlpool', 'Milky Way'], correct: 3 },
  { cat: 'Science', diff: 'medium', q: 'Which blood type is known as the universal donor?', choices: ['O negative', 'AB positive', 'A negative', 'B positive'], correct: 0 },
  { cat: 'Science', diff: 'medium', q: 'Which element has the atomic number 1?', choices: ['Helium', 'Hydrogen', 'Lithium', 'Carbon'], correct: 1 },
  { cat: 'Science', diff: 'medium', q: 'What term describes energy stored in an object due to its position or height?', choices: ['Kinetic energy', 'Thermal energy', 'Potential energy', 'Chemical energy'], correct: 2 },
  { cat: 'Science', diff: 'hard', q: 'What is the hardest naturally occurring substance on Earth?', choices: ['Quartz', 'Titanium', 'Graphite', 'Diamond'], correct: 3 },
  { cat: 'Science', diff: 'hard', q: 'Which physicist proposed the uncertainty principle in quantum mechanics?', choices: ['Werner Heisenberg', 'Niels Bohr', 'Erwin Schrodinger', 'Max Planck'], correct: 0 },
  { cat: 'Science', diff: 'hard', q: 'What is the name of the cell division process that produces reproductive cells?', choices: ['Mitosis', 'Meiosis', 'Binary fission', 'Cytokinesis'], correct: 1 },
  { cat: 'Science', diff: 'hard', q: 'What is the boundary around a black hole beyond which nothing can escape called?', choices: ['Singularity', 'Photon sphere', 'Event horizon', 'Accretion disk'], correct: 2 },
  { cat: 'Science', diff: 'hard', q: 'What is the name of the supercontinent believed to have existed before today\'s continents split apart?', choices: ['Laurasia', 'Gondwana', 'Rodinia', 'Pangaea'], correct: 3 },
  { cat: 'Science', diff: 'hard', q: 'Which part of the brain primarily controls balance and muscle coordination?', choices: ['Cerebellum', 'Cerebrum', 'Hypothalamus', 'Medulla oblongata'], correct: 0 },
  { cat: 'Science', diff: 'hard', q: 'What is the SI unit used to measure electrical resistance?', choices: ['Farad', 'Ohm', 'Henry', 'Tesla'], correct: 1 },
  { cat: 'Science', diff: 'hard', q: 'Which astronomer first proposed a heliocentric model of the solar system in the modern era?', choices: ['Galileo Galilei', 'Johannes Kepler', 'Nicolaus Copernicus', 'Tycho Brahe'], correct: 2 },
  { cat: 'Science', diff: 'hard', q: 'What term describes an organism that produces its own food through photosynthesis?', choices: ['Heterotroph', 'Decomposer', 'Saprophyte', 'Autotroph'], correct: 3 },
  { cat: 'Science', diff: 'hard', q: 'What is it called when a substance changes directly from a solid to a gas?', choices: ['Sublimation', 'Condensation', 'Deposition', 'Evaporation'], correct: 0 },
  { cat: 'Science', diff: 'hard', q: 'Which celestial body is primarily responsible for creating ocean tides on Earth?', choices: ['The Sun', 'The Moon', 'Venus', 'Mars'], correct: 1 },
  { cat: 'Science', diff: 'hard', q: 'Which layer of Earth\'s atmosphere contains the ozone layer that absorbs most UV radiation?', choices: ['Troposphere', 'Mesosphere', 'Stratosphere', 'Thermosphere'], correct: 2 },
  { cat: 'Science', diff: 'hard', q: 'What temperature is defined as absolute zero, in degrees Celsius?', choices: ['-100°C', '-173°C', '-373°C', '-273°C'], correct: 3 },
  { cat: 'History', diff: 'easy', q: 'Which ancient civilization built the Great Pyramid of Giza?', choices: ['Egyptians', 'Mesopotamians', 'Romans', 'Greeks'], correct: 0 },
  { cat: 'History', diff: 'easy', q: 'In what year did Christopher Columbus first reach the Americas?', choices: ['1500', '1492', '1476', '1510'], correct: 1 },
  { cat: 'History', diff: 'easy', q: 'In what year did World War II end?', choices: ['1943', '1944', '1945', '1947'], correct: 2 },
  { cat: 'History', diff: 'easy', q: 'Who was the first person to walk on the Moon?', choices: ['Buzz Aldrin', 'Yuri Gagarin', 'John Glenn', 'Neil Armstrong'], correct: 3 },
  { cat: 'History', diff: 'easy', q: 'In what year was the U.S. Declaration of Independence signed?', choices: ['1776', '1774', '1781', '1789'], correct: 0 },
  { cat: 'History', diff: 'easy', q: 'In what year did the Titanic sink?', choices: ['1905', '1912', '1918', '1923'], correct: 1 },
  { cat: 'History', diff: 'easy', q: 'Who is credited with achieving the first powered airplane flight?', choices: ['Charles Lindbergh', 'Amelia Earhart', 'The Wright brothers', 'Otto Lilienthal'], correct: 2 },
  { cat: 'History', diff: 'easy', q: 'In what year did the Berlin Wall fall?', choices: ['1985', '1987', '1991', '1989'], correct: 3 },
  { cat: 'History', diff: 'easy', q: 'Which U.S. president led the country during the Civil War?', choices: ['Abraham Lincoln', 'Andrew Jackson', 'Ulysses S. Grant', 'Theodore Roosevelt'], correct: 0 },
  { cat: 'History', diff: 'easy', q: 'The Great Wall was built primarily to defend which country from invasions?', choices: ['Japan', 'China', 'India', 'Persia'], correct: 1 },
  { cat: 'History', diff: 'easy', q: 'After his final defeat, Napoleon Bonaparte was exiled to which island?', choices: ['Corsica', 'Sicily', 'St. Helena', 'Malta'], correct: 2 },
  { cat: 'History', diff: 'easy', q: 'Cleopatra was the last active ruler of which ancient kingdom?', choices: ['Babylon', 'Persia', 'Carthage', 'Egypt'], correct: 3 },
  { cat: 'History', diff: 'easy', q: 'The Japanese attack on Pearl Harbor took place in which year?', choices: ['1941', '1939', '1940', '1942'], correct: 0 },
  { cat: 'History', diff: 'easy', q: 'Johannes Gutenberg is best known for inventing what?', choices: ['The telescope', 'The printing press', 'The steam engine', 'Gunpowder'], correct: 1 },
  { cat: 'History', diff: 'medium', q: 'Who became the first emperor of Rome?', choices: ['Julius Caesar', 'Nero', 'Augustus', 'Constantine'], correct: 2 },
  { cat: 'History', diff: 'medium', q: 'In what year did World War I begin?', choices: ['1912', '1916', '1918', '1914'], correct: 3 },
  { cat: 'History', diff: 'medium', q: 'The storming of the Bastille, which sparked the French Revolution, occurred in what year?', choices: ['1789', '1776', '1799', '1804'], correct: 0 },
  { cat: 'History', diff: 'medium', q: 'The Magna Carta, limiting the power of English kings, was signed in what year?', choices: ['1066', '1215', '1348', '1492'], correct: 1 },
  { cat: 'History', diff: 'medium', q: 'The Industrial Revolution began in which country?', choices: ['France', 'Germany', 'Great Britain', 'United States'], correct: 2 },
  { cat: 'History', diff: 'medium', q: 'The Boston Tea Party was a protest against taxes imposed by which country?', choices: ['France', 'Spain', 'Netherlands', 'Great Britain'], correct: 3 },
  { cat: 'History', diff: 'medium', q: 'The United States purchased the Louisiana Territory from which country?', choices: ['France', 'Spain', 'Britain', 'Mexico'], correct: 0 },
  { cat: 'History', diff: 'medium', q: 'The D-Day invasion during World War II took place on the beaches of which region?', choices: ['Sicily', 'Normandy', 'Brittany', 'Provence'], correct: 1 },
  { cat: 'History', diff: 'medium', q: 'The first atomic bomb used in warfare was dropped on which city?', choices: ['Nagasaki', 'Tokyo', 'Hiroshima', 'Kyoto'], correct: 2 },
  { cat: 'History', diff: 'medium', q: 'Marco Polo was famous for his travels to which region?', choices: ['Africa', 'South America', 'Australia', 'China'], correct: 3 },
  { cat: 'History', diff: 'medium', q: "The Spanish Armada was defeated in 1588 by which country's navy?", choices: ['England', 'France', 'Portugal', 'Netherlands'], correct: 0 },
  { cat: 'History', diff: 'medium', q: 'Constantinople fell to the Ottoman Empire in what year?', choices: ['1204', '1453', '1492', '1517'], correct: 1 },
  { cat: 'History', diff: 'medium', q: 'In what year did Abraham Lincoln issue the Emancipation Proclamation?', choices: ['1860', '1861', '1863', '1865'], correct: 2 },
  { cat: 'History', diff: 'hard', q: 'Genghis Khan founded which empire, the largest contiguous land empire in history?', choices: ['Ottoman Empire', 'Persian Empire', 'Mughal Empire', 'Mongol Empire'], correct: 3 },
  { cat: 'History', diff: 'hard', q: 'Vasco da Gama was the first European to reach India by sea, sailing around which continent?', choices: ['Africa', 'Asia', 'South America', 'Australia'], correct: 0 },
  { cat: 'History', diff: 'hard', q: "Ferdinand Magellan's expedition was the first to achieve what feat, though he died before completing it?", choices: ['Crossing the Atlantic', 'Circumnavigating the globe', 'Reaching the North Pole', 'Discovering Australia'], correct: 1 },
  { cat: 'History', diff: 'hard', q: 'In what year was Julius Caesar assassinated?', choices: ['58 BC', '27 BC', '44 BC', '14 AD'], correct: 2 },
  { cat: 'History', diff: 'hard', q: 'The Black Death plague swept through Europe primarily during which century?', choices: ['12th century', '13th century', '15th century', '14th century'], correct: 3 },
  { cat: 'History', diff: 'hard', q: 'The Renaissance is generally considered to have originated in which country?', choices: ['Italy', 'France', 'Spain', 'Germany'], correct: 0 },
  { cat: 'History', diff: 'hard', q: 'The Berlin Airlift was organized by Western Allies in response to a Soviet blockade in what year?', choices: ['1945', '1948', '1953', '1961'], correct: 1 },
  { cat: 'History', diff: 'hard', q: 'How many wives did King Henry VIII of England have?', choices: ['Four', 'Five', 'Six', 'Seven'], correct: 2 },
  { cat: 'History', diff: 'hard', q: 'The Suez Canal, connecting the Mediterranean and Red Seas, opened in what year?', choices: ['1859', '1879', '1889', '1869'], correct: 3 },
  { cat: 'History', diff: 'hard', q: 'Joan of Arc played a pivotal role in which conflict?', choices: ["The Hundred Years' War", 'The Crusades', 'The War of the Roses', 'The Napoleonic Wars'], correct: 0 },
  { cat: 'History', diff: 'hard', q: 'Alexander the Great was king of which ancient kingdom?', choices: ['Sparta', 'Macedon', 'Athens', 'Persia'], correct: 1 },
  { cat: 'History', diff: 'hard', q: 'The Wall Street Crash that triggered the Great Depression occurred in what year?', choices: ['1927', '1932', '1929', '1935'], correct: 2 },
  { cat: 'History', diff: 'hard', q: 'The Panama Canal, connecting the Atlantic and Pacific Oceans, opened in what year?', choices: ['1904', '1920', '1930', '1914'], correct: 3 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which sitcom is set in a coffee shop called Central Perk?', choices: ['Friends', 'Seinfeld', 'How I Met Your Mother', 'The Big Bang Theory'], correct: 0 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which social media app is best known for short-form videos and viral dance trends?', choices: ['Snapchat', 'TikTok', 'Pinterest', 'LinkedIn'], correct: 1 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which pop star released the 2014 album "1989"?', choices: ['Katy Perry', 'Ariana Grande', 'Taylor Swift', 'Adele'], correct: 2 },
  { cat: 'Pop Culture', diff: 'easy', q: 'The animated Simpson family lives in which fictional town?', choices: ['Quahog', 'Bedrock', 'South Park', 'Springfield'], correct: 3 },
  { cat: 'Pop Culture', diff: 'easy', q: 'In which video game do players mine blocks and build structures in an open world?', choices: ['Minecraft', 'Roblox', 'Fortnite', 'Terraria'], correct: 0 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which media mogul hosted her own talk show for 25 years before launching a TV network?', choices: ['Ellen DeGeneres', 'Oprah Winfrey', 'Barbara Walters', 'Wendy Williams'], correct: 1 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which video-sharing website, founded in 2005, was purchased by Google the following year?', choices: ['Vimeo', 'Dailymotion', 'YouTube', 'Twitch'], correct: 2 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which British band recorded the songs "Hey Jude" and "Let It Be"?', choices: ['The Rolling Stones', 'Queen', 'Pink Floyd', 'The Beatles'], correct: 3 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which coffee chain uses a twin-tailed mermaid, or siren, as its logo?', choices: ['Starbucks', 'Peet\'s Coffee', 'Costa Coffee', 'Dunkin\''], correct: 0 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which battle royale video game popularized a dance emote called "the floss"?', choices: ['Apex Legends', 'Fortnite', 'PUBG', 'Call of Duty: Warzone'], correct: 1 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which annual music awards show hands out trophies shaped like golden gramophones?', choices: ['American Music Awards', 'Billboard Music Awards', 'Grammy Awards', 'MTV Video Music Awards'], correct: 2 },
  { cat: 'Pop Culture', diff: 'easy', q: 'On which game show did contestants use lifelines and hear "Is that your final answer?"', choices: ['Jeopardy!', 'Wheel of Fortune', 'Deal or No Deal', 'Who Wants to Be a Millionaire'], correct: 3 },
  { cat: 'Pop Culture', diff: 'easy', q: 'The Kardashian-Jenner family first became famous through which reality TV show?', choices: ['Keeping Up with the Kardashians', 'The Simple Life', 'The Hills', 'Laguna Beach'], correct: 0 },
  { cat: 'Pop Culture', diff: 'easy', q: 'Which video game franchise uses the slogan "Gotta catch \'em all"?', choices: ['Digimon', 'Pokemon', 'Yu-Gi-Oh!', 'Skylanders'], correct: 1 },
  { cat: 'Pop Culture', diff: 'medium', q: 'The fantasy series "Game of Thrones" originally aired on which cable network?', choices: ['Showtime', 'AMC', 'HBO', 'Starz'], correct: 2 },
  { cat: 'Pop Culture', diff: 'medium', q: 'What term describes tricking someone into clicking a link that plays a 1987 Rick Astley song?', choices: ['Catfishing', 'Trolling', 'Doxxing', 'Rickrolling'], correct: 3 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which South Korean group had a global hit with the English-language single "Dynamite"?', choices: ['BTS', 'EXO', 'Blackpink', 'Seventeen'], correct: 0 },
  { cat: 'Pop Culture', diff: 'medium', q: 'In which mobile puzzle game do players swap colorful candies to form matches?', choices: ['Bejeweled', 'Candy Crush Saga', 'Fruit Ninja', 'Angry Birds'], correct: 1 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which cooking competition show is known for its signature "mystery box" challenge?', choices: ['Top Chef', 'Chopped', 'MasterChef', 'Hell\'s Kitchen'], correct: 2 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which entrepreneur co-founded PayPal before becoming CEO of Tesla and SpaceX?', choices: ['Jeff Bezos', 'Mark Zuckerberg', 'Peter Thiel', 'Elon Musk'], correct: 3 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which music streaming service popularized an annual personalized listening recap called "Wrapped"?', choices: ['Spotify', 'Apple Music', 'YouTube Music', 'Pandora'], correct: 0 },
  { cat: 'Pop Culture', diff: 'medium', q: 'On which reality competition are contestants marooned and voted off by fellow players?', choices: ['Big Brother', 'Survivor', 'The Amazing Race', 'Naked and Afraid'], correct: 1 },
  { cat: 'Pop Culture', diff: 'medium', q: 'The 2014 "Ice Bucket Challenge" raised money and awareness for which disease?', choices: ['Breast cancer', 'Multiple sclerosis', 'ALS', 'Alzheimer\'s'], correct: 2 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which shoe brand\'s foam clogs are commonly decorated with charms called Jibbitz?', choices: ['Birkenstock', 'Skechers', 'Havaianas', 'Crocs'], correct: 3 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Which Nintendo home console, released in 2006, was controlled with a motion-sensing remote?', choices: ['Wii', 'GameCube', 'Switch', 'Wii U'], correct: 0 },
  { cat: 'Pop Culture', diff: 'medium', q: 'Lady Gaga was born under which real name?', choices: ['Nicole Richie', 'Stefani Germanotta', 'Katheryn Hudson', 'Robyn Fenty'], correct: 1 },
  { cat: 'Pop Culture', diff: 'medium', q: '"Saturday Night Live" has broadcast live from which NBC studio since 1975?', choices: ['Studio 6B', 'Studio 3A', 'Studio 8H', 'Studio 1A'], correct: 2 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Facebook, launched by Mark Zuckerberg in 2004, was originally released under what name?', choices: ['MyFace', 'CampusConnect', 'FaceLink', 'Thefacebook'], correct: 3 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Beyonce\'s 2016 album "Lemonade" was released alongside a full-length what?', choices: ['Visual film', 'Broadway musical', 'Graphic novel', 'Documentary series'], correct: 0 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Who hosted "Jeopardy!" for over 35 years until his death in 2020?', choices: ['Pat Sajak', 'Alex Trebek', 'Drew Carey', 'Regis Philbin'], correct: 1 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Before acting, Dwayne Johnson was a professional wrestler known by what ring name?', choices: ['Stone Cold', 'The Undertaker', 'The Rock', 'Triple H'], correct: 2 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Angry Birds was created by which Finnish video game company?', choices: ['Supercell', 'King Digital', 'Mojang', 'Rovio Entertainment'], correct: 3 },
  { cat: 'Pop Culture', diff: 'hard', q: 'The "Harlem Shake" group-dancing video meme went viral in which year?', choices: ['2013', '2011', '2012', '2015'], correct: 0 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Adele\'s album "21" won which major award for Album of the Year in 2012?', choices: ['Billboard Music Award', 'Grammy Award', 'American Music Award', 'Brit Award'], correct: 1 },
  { cat: 'Pop Culture', diff: 'hard', q: 'The series "Breaking Bad" is primarily set in which U.S. city?', choices: ['Phoenix, Arizona', 'El Paso, Texas', 'Albuquerque, New Mexico', 'Las Vegas, Nevada'], correct: 2 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Prince Harry married Meghan Markle in a widely televised royal wedding in which year?', choices: ['2016', '2017', '2019', '2018'], correct: 3 },
  { cat: 'Pop Culture', diff: 'hard', q: 'The puzzle game Tetris was created in 1984 by a programmer from which country?', choices: ['Soviet Union', 'Poland', 'Hungary', 'East Germany'], correct: 0 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Ed Sheeran\'s "Shape of You" became one of the most-streamed songs of all time on which platform?', choices: ['Apple Music', 'Spotify', 'SoundCloud', 'Pandora'], correct: 1 },
  { cat: 'Pop Culture', diff: 'hard', q: 'Wikipedia, the free online encyclopedia, was founded in which year?', choices: ['1999', '2003', '2001', '2005'], correct: 2 },
  { cat: 'Pop Culture', diff: 'hard', q: 'The U.S. version of "The Office" was adapted from a sitcom originally from which country?', choices: ['Australia', 'Canada', 'Ireland', 'United Kingdom'], correct: 3 },
  { cat: 'Sports', diff: 'easy', q: 'How many players from each team are on the court at once in basketball?', choices: ['5', '4', '6', '7'], correct: 0 },
  { cat: 'Sports', diff: 'easy', q: 'How many innings are in a standard Major League Baseball game?', choices: ['7', '9', '8', '10'], correct: 1 },
  { cat: 'Sports', diff: 'easy', q: 'How many Grand Slam tournaments are held each year in tennis?', choices: ['2', '3', '4', '5'], correct: 2 },
  { cat: 'Sports', diff: 'easy', q: 'The Summer Olympic Games are traditionally held every how many years?', choices: ['2', '3', '5', '4'], correct: 3 },
  { cat: 'Sports', diff: 'easy', q: 'How many holes are played in a standard round of golf?', choices: ['18', '9', '16', '20'], correct: 0 },
  { cat: 'Sports', diff: 'easy', q: 'How many points is a touchdown worth in American football?', choices: ['3', '6', '5', '7'], correct: 1 },
  { cat: 'Sports', diff: 'easy', q: 'How many skaters, excluding the goalie, does each NHL team have on the ice at full strength?', choices: ['4', '7', '5', '6'], correct: 2 },
  { cat: 'Sports', diff: 'easy', q: 'How many interlocking rings appear on the Olympic flag?', choices: ['4', '6', '7', '5'], correct: 3 },
  { cat: 'Sports', diff: 'easy', q: 'Which color card signals that a soccer player has been sent off?', choices: ['Red', 'Yellow', 'Blue', 'Black'], correct: 0 },
  { cat: 'Sports', diff: 'easy', q: 'Michael Jordan won six NBA championships while playing for which team?', choices: ['Los Angeles Lakers', 'Chicago Bulls', 'Boston Celtics', 'New York Knicks'], correct: 1 },
  { cat: 'Sports', diff: 'easy', q: 'What playing surface is used at the Wimbledon Championships?', choices: ['Clay', 'Hard court', 'Grass', 'Carpet'], correct: 2 },
  { cat: 'Sports', diff: 'easy', q: 'How many bases must a runner touch to score a home run, including home plate?', choices: ['3', '5', '6', '4'], correct: 3 },
  { cat: 'Sports', diff: 'easy', q: 'What is the heaviest weight class in professional boxing called?', choices: ['Heavyweight', 'Cruiserweight', 'Light heavyweight', 'Super heavyweight'], correct: 0 },
  { cat: 'Sports', diff: 'easy', q: 'What shape is an American football most simply described as?', choices: ['A sphere', 'A prolate spheroid (oval)', 'A cylinder', 'A cone'], correct: 1 },
  { cat: 'Sports', diff: 'medium', q: 'In golf, what term describes a score of one stroke under par on a hole?', choices: ['Bogey', 'Eagle', 'Birdie', 'Albatross'], correct: 2 },
  { cat: 'Sports', diff: 'medium', q: 'In tennis scoring, what word is used to mean a score of zero?', choices: ['Nil', 'Duck', 'Blank', 'Love'], correct: 3 },
  { cat: 'Sports', diff: 'medium', q: 'The NBA Finals is played as a best-of-how-many-games series?', choices: ['7', '5', '6', '9'], correct: 0 },
  { cat: 'Sports', diff: 'medium', q: 'How many rounds are scheduled in a modern professional boxing world title bout?', choices: ['10', '12', '15', '20'], correct: 1 },
  { cat: 'Sports', diff: 'medium', q: 'The first modern Olympic Games in 1896 were held in which city?', choices: ['Paris', 'Rome', 'Athens', 'London'], correct: 2 },
  { cat: 'Sports', diff: 'medium', q: 'What term describes a single player scoring three goals in one hockey game?', choices: ['Triple play', 'Trifecta', 'Grand slam', 'Hat trick'], correct: 3 },
  { cat: 'Sports', diff: 'medium', q: 'How many major championships do male professional golfers compete for each year?', choices: ['4', '3', '5', '6'], correct: 0 },
  { cat: 'Sports', diff: 'medium', q: 'A marathon covers approximately how many miles?', choices: ['24.2', '26.2', '25.2', '27.2'], correct: 1 },
  { cat: 'Sports', diff: 'medium', q: 'A regulation basketball hoop is set at what height above the floor?', choices: ['9 feet', '11 feet', '10 feet', '12 feet'], correct: 2 },
  { cat: 'Sports', diff: 'medium', q: 'In the individual medley, which swimming stroke is swum first?', choices: ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly'], correct: 3 },
  { cat: 'Sports', diff: 'medium', q: 'In the Tour de France, what color jersey is worn by the overall race leader?', choices: ['Yellow', 'Green', 'Polka dot', 'White'], correct: 0 },
  { cat: 'Sports', diff: 'medium', q: 'How many players from each team are on the field at once in American football?', choices: ['10', '11', '12', '9'], correct: 1 },
  { cat: 'Sports', diff: 'medium', q: 'The FIFA World Cup is held every how many years?', choices: ['2', '3', '4', '5'], correct: 2 },
  { cat: 'Sports', diff: 'hard', q: 'Which country has hosted the Summer Olympic Games the most times?', choices: ['United Kingdom', 'France', 'Greece', 'United States'], correct: 3 },
  { cat: 'Sports', diff: 'hard', q: 'What is the rare pitching feat called when a pitcher retires all 27 batters faced with none reaching base?', choices: ['Perfect game', 'No-hitter', 'Shutout', 'Complete game'], correct: 0 },
  { cat: 'Sports', diff: 'hard', q: 'Which player is the only man to win the calendar-year Grand Slam in tennis twice?', choices: ['Roger Federer', 'Rod Laver', 'Bjorn Borg', 'Don Budge'], correct: 1 },
  { cat: 'Sports', diff: 'hard', q: 'In which weight division did Muhammad Ali win Olympic gold at the 1960 Rome Games?', choices: ['Heavyweight', 'Middleweight', 'Light heavyweight', 'Welterweight'], correct: 2 },
  { cat: 'Sports', diff: 'hard', q: 'Which team won the first NBA Championship in 1947?', choices: ['Boston Celtics', 'New York Knicks', 'Minneapolis Lakers', 'Philadelphia Warriors'], correct: 3 },
  { cat: 'Sports', diff: 'hard', q: 'How many gold medals did Jesse Owens win at the 1936 Berlin Olympics?', choices: ['4', '3', '5', '6'], correct: 0 },
  { cat: 'Sports', diff: 'hard', q: 'Which golfer holds the record for the most major championship wins, with 18 titles?', choices: ['Tiger Woods', 'Jack Nicklaus', 'Arnold Palmer', 'Sam Snead'], correct: 1 },
  { cat: 'Sports', diff: 'hard', q: 'What is the NHL trophy awarded to the most valuable player of the playoffs called?', choices: ['Hart Trophy', 'Norris Trophy', 'Conn Smythe Trophy', 'Vezina Trophy'], correct: 2 },
  { cat: 'Sports', diff: 'hard', q: 'Which country has won the most FIFA World Cup titles, with five championships?', choices: ['Germany', 'Italy', 'Argentina', 'Brazil'], correct: 3 },
  { cat: 'Sports', diff: 'hard', q: 'In what year were the first Winter Olympic Games held, in Chamonix, France?', choices: ['1924', '1928', '1932', '1936'], correct: 0 },
  { cat: 'Sports', diff: 'hard', q: 'Which legendary New York Yankees slugger was known as \'The Sultan of Swat\'?', choices: ['Lou Gehrig', 'Babe Ruth', 'Ty Cobb', 'Hank Aaron'], correct: 1 },
  { cat: 'Sports', diff: 'hard', q: 'The 1974 \'Rumble in the Jungle\' bout between Muhammad Ali and George Foreman took place in which country?', choices: ['Nigeria', 'Ghana', 'Zaire', 'Kenya'], correct: 2 },
  { cat: 'Sports', diff: 'hard', q: 'What is the term for a score of three strokes under par on a single hole in golf?', choices: ['Eagle', 'Condor', 'Birdie', 'Albatross'], correct: 3 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who directed the movie "Jurassic Park"?', choices: ['George Lucas', 'Robert Zemeckis', 'Ron Howard', 'Steven Spielberg'], correct: 3 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who directed the 1997 film "Titanic"?', choices: ['James Cameron', 'Steven Spielberg', 'Christopher Nolan', 'Martin Scorsese'], correct: 0 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which actor played Captain Jack Sparrow in the "Pirates of the Caribbean" films?', choices: ['Johnny Depp', 'Orlando Bloom', 'Geoffrey Rush', 'Javier Bardem'], correct: 0 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which studio created the character Mickey Mouse?', choices: ['Warner Bros.', 'Universal', 'Paramount', 'Walt Disney'], correct: 3 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who played Dorothy in "The Wizard of Oz" (1939)?', choices: ['Judy Garland', 'Shirley Temple', 'Ginger Rogers', 'Doris Day'], correct: 0 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which actor played Luke Skywalker in the original "Star Wars" trilogy?', choices: ['Mark Hamill', 'Harrison Ford', 'Kenny Baker', 'Peter Mayhew'], correct: 0 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who played Batman in Christopher Nolan\'s "The Dark Knight" trilogy?', choices: ['George Clooney', 'Val Kilmer', 'Christian Bale', 'Michael Keaton'], correct: 2 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which actor starred as the title character in "Forrest Gump"?', choices: ['Tom Hanks', 'Kevin Costner', 'Robin Williams', 'Bill Murray'], correct: 0 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who played Hermione Granger in the "Harry Potter" film series?', choices: ['Emma Stone', 'Emma Watson', 'Emma Roberts', 'Kate Winslet'], correct: 1 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which 1995 film is widely credited as the first fully computer-animated feature film?', choices: ['Shrek', 'Antz', 'A Bug\'s Life', 'Toy Story'], correct: 3 },
  { cat: 'Entertainment', diff: 'easy', q: 'Who directed the 1972 crime classic "The Godfather"?', choices: ['Martin Scorsese', 'Francis Ford Coppola', 'Sidney Lumet', 'Brian De Palma'], correct: 1 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which actor plays Tony Stark, also known as Iron Man, in the Marvel films?', choices: ['Chris Evans', 'Chris Hemsworth', 'Robert Downey Jr.', 'Mark Ruffalo'], correct: 2 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which 1937 Disney film is regarded as the first full-length animated feature film?', choices: ['Pinocchio', 'Fantasia', 'Bambi', 'Snow White and the Seven Dwarfs'], correct: 3 },
  { cat: 'Entertainment', diff: 'easy', q: 'Which actor played Frodo Baggins in Peter Jackson\'s "The Lord of the Rings" trilogy?', choices: ['Sean Astin', 'Elijah Wood', 'Orlando Bloom', 'Viggo Mortensen'], correct: 1 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which actor has won the most Academy Awards for Best Actor, with three wins?', choices: ['Jack Nicholson', 'Daniel Day-Lewis', 'Tom Hanks', 'Marlon Brando'], correct: 1 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which composer wrote the iconic film scores for "Star Wars", "Jaws", and "Jurassic Park"?', choices: ['Hans Zimmer', 'Alan Silvestri', 'John Williams', 'James Horner'], correct: 2 },
  { cat: 'Entertainment', diff: 'medium', q: 'Who directed the 1994 film "Pulp Fiction"?', choices: ['Guy Ritchie', 'David Fincher', 'Robert Rodriguez', 'Quentin Tarantino'], correct: 3 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which Alfred Hitchcock film features a famous murder scene set in a motel shower?', choices: ['Vertigo', 'Rear Window', 'Psycho', 'The Birds'], correct: 2 },
  { cat: 'Entertainment', diff: 'medium', q: 'Who directed the 2010 film "Inception"?', choices: ['Denis Villeneuve', 'David Fincher', 'Ridley Scott', 'Christopher Nolan'], correct: 3 },
  { cat: 'Entertainment', diff: 'medium', q: 'Martin Scorsese won his first competitive Best Director Oscar for which 2006 film?', choices: ['Goodfellas', 'The Departed', 'Raging Bull', 'Taxi Driver'], correct: 1 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which actor voices Woody in the "Toy Story" film franchise?', choices: ['Tim Allen', 'Tom Hanks', 'Billy Crystal', 'John Ratzenberger'], correct: 1 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which actor won a posthumous Oscar for playing the Joker in "The Dark Knight"?', choices: ['Jack Nicholson', 'Heath Ledger', 'Joaquin Phoenix', 'Jared Leto'], correct: 1 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which 2008 film launched the Marvel Cinematic Universe?', choices: ['Thor', 'Captain America: The First Avenger', 'Iron Man', 'The Incredible Hulk'], correct: 2 },
  { cat: 'Entertainment', diff: 'medium', q: 'Who directed the 1993 Holocaust drama "Schindler\'s List"?', choices: ['Roman Polanski', 'Oliver Stone', 'Steven Spielberg', 'Milos Forman'], correct: 2 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which director co-founded Studio Ghibli and directed "Spirited Away"?', choices: ['Hayao Miyazaki', 'Isao Takahata', 'Katsuhiro Otomo', 'Mamoru Hosoda'], correct: 0 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which actor played the killer cyborg in 1984\'s "The Terminator"?', choices: ['Sylvester Stallone', 'Jean-Claude Van Damme', 'Dolph Lundgren', 'Arnold Schwarzenegger'], correct: 3 },
  { cat: 'Entertainment', diff: 'medium', q: 'Which actress holds the record for most Best Actress Oscar wins, with four?', choices: ['Meryl Streep', 'Katharine Hepburn', 'Bette Davis', 'Ingrid Bergman'], correct: 1 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which 1997 film was the first to gross $1 billion worldwide at the box office?', choices: ['Star Wars', 'Jurassic Park', 'Titanic', 'E.T. the Extra-Terrestrial'], correct: 2 },
  { cat: 'Entertainment', diff: 'hard', q: 'Who was the first African American actor to win the Academy Award for Best Actor?', choices: ['Sidney Poitier', 'Denzel Washington', 'Morgan Freeman', 'Forest Whitaker'], correct: 0 },
  { cat: 'Entertainment', diff: 'hard', q: 'Who directed and starred in the 1941 film "Citizen Kane"?', choices: ['John Huston', 'Billy Wilder', 'William Wyler', 'Orson Welles'], correct: 3 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which giant-monster franchise began in Japan in 1954 with a creature awakened by nuclear testing?', choices: ['King Kong', 'Godzilla', 'Gamera', 'Cloverfield'], correct: 1 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which 1991 film became the first animated feature ever nominated for Best Picture?', choices: ['The Lion King', 'Beauty and the Beast', 'Toy Story 3', 'Up'], correct: 1 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which actress provides the singing and speaking voice of Elsa in Disney\'s "Frozen"?', choices: ['Kristen Bell', 'Anna Kendrick', 'Idina Menzel', 'Demi Lovato'], correct: 2 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which film tied the record for most Academy Award wins with eleven, alongside "Titanic" and "Ben-Hur"?', choices: ['Gladiator', 'The English Patient', 'Amadeus', 'The Lord of the Rings: The Return of the King'], correct: 3 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which actor played James Bond in the most official films, with seven?', choices: ['Sean Connery', 'Roger Moore', 'Pierce Brosnan', 'Daniel Craig'], correct: 1 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which studio produced the animated hit "Shrek" in 2001?', choices: ['Pixar', 'DreamWorks Animation', 'Blue Sky Studios', 'Illumination'], correct: 1 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which actress played the assassin known as "The Bride" in "Kill Bill"?', choices: ['Daryl Hannah', 'Lucy Liu', 'Uma Thurman', 'Vivica A. Fox'], correct: 2 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which actor played Hannibal Lecter in "The Silence of the Lambs"?', choices: ['Ian McKellen', 'Anthony Perkins', 'Anthony Hopkins', 'Christopher Lee'], correct: 2 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which 1927 film won the first-ever Academy Award for Best Picture?', choices: ['Sunrise', 'The Broadway Melody', 'All Quiet on the Western Front', 'Wings'], correct: 3 },
  { cat: 'Entertainment', diff: 'hard', q: 'Which actress holds the record for the most Academy Award nominations of any actor?', choices: ['Katharine Hepburn', 'Jack Nicholson', 'Judi Dench', 'Meryl Streep'], correct: 3 },
];

// True/false speed round, ported from the single-device build's LIGHTNING set.
const LIGHTNING_ITEMS = [
  { s: 'The Great Wall of China is visible from space with the naked eye.', truth: false },
  { s: 'Octopuses have three hearts.', truth: true },
  { s: 'Bats are completely blind.', truth: false },
  { s: 'The Eiffel Tower grows taller in summer as the metal expands.', truth: true },
  { s: 'A group of flamingos is called a "flamboyance."', truth: true },
  { s: 'Sharks existed before trees.', truth: true },
  { s: 'Mount Everest is the tallest mountain on Earth measured from base to peak.', truth: false },
  { s: 'Honey never spoils.', truth: true },
  { s: 'A bolt of lightning is hotter than the surface of the sun.', truth: true },
  { s: 'Goldfish have a memory span of only a few seconds.', truth: false },
  { s: 'Bananas are classified as berries, but strawberries are not.', truth: true },
  { s: 'Napoleon Bonaparte was unusually short for his era.', truth: false },
  { s: 'Humans can distinguish more than a trillion different smells.', truth: true },
  { s: 'People only use ten percent of their brains.', truth: false },
  { s: 'Wombat droppings are cube-shaped.', truth: true },
  { s: 'Glass is a slow-moving liquid, which is why old windows are thicker at the bottom.', truth: false },
  { s: 'There are more possible chess games than atoms in the observable universe.', truth: true },
  { s: 'Lightning never strikes the same place twice.', truth: false },
  { s: 'The Eiffel Tower grows several centimeters taller in summer heat.', truth: true },
  { s: 'Chameleons change color mainly to camouflage with their surroundings.', truth: false },
  { s: 'Venus is the hottest planet in the solar system.', truth: true },
  { s: 'Albert Einstein failed math as a student.', truth: false },
  { s: 'A day on Venus lasts longer than a Venusian year.', truth: true },
  { s: 'The Coriolis effect decides which way water swirls down your bathtub drain.', truth: false },
  { s: 'Cleopatra lived closer in time to the moon landing than to the building of the Great Pyramid.', truth: true },
  { s: 'Vikings wore horned helmets into battle.', truth: false },
  { s: 'Oxford University predates the founding of the Aztec Empire.', truth: true },
  { s: 'Camels store water in the humps on their backs.', truth: false },
  { s: 'Butterflies taste their food using sensors on their feet.', truth: true },
  { s: 'The Sahara is the largest desert in the world.', truth: false },
  { s: 'The shortest war on record lasted under an hour.', truth: true },
  { s: 'Diamonds form from highly compressed coal.', truth: false },
  { s: 'Polar bears have black skin beneath their white fur.', truth: true },
  { s: 'It takes seven years to digest swallowed chewing gum.', truth: false },
  { s: 'Saturn is less dense than water.', truth: true },
  { s: 'Each region of the tongue detects only one specific taste.', truth: false },
  { s: 'The man who invented the Pringles can is buried in one.', truth: true },
  { s: 'Ostriches bury their heads in the sand when frightened.', truth: false },
  { s: 'Almonds are close botanical relatives of peaches.', truth: true },
  { s: 'Frankenstein is the name of the monster in Mary Shelley\'s novel.', truth: false },
];

// Daily Double questions are no longer their own tiny fixed pool — they're
// drawn from MAIN_QUESTIONS at game-start time (see pickDailyDoubleSet),
// same as every other multiple-choice question in the game, so they get
// the benefit of the same 240-question pool instead of repeating after two
// games. Unlike the original single-device build (one spotlighted
// contestant), every player plays their own Daily Double at the same time:
// each wagers off their own score, then answers — win the wager or lose
// it, independent of everyone else.

// Avatars, ported from the single-device build's setup screen. bg 1-6 cycles
// through the same tile/accent/good colors used for the wheel tiles.
const AVATARS = [
  { emoji: '🦊', bg: 1 }, // fox
  { emoji: '🐙', bg: 2 }, // octopus
  { emoji: '🦁', bg: 3 }, // lion
  { emoji: '🦉', bg: 4 }, // owl
  { emoji: '🐧', bg: 5 }, // penguin
  { emoji: '🦄', bg: 6 }, // unicorn
  { emoji: '🐼', bg: 1 }, // panda
  { emoji: '🐸', bg: 2 }, // frog
  { emoji: '🐵', bg: 3 }, // monkey
  { emoji: '🐻', bg: 4 }, // bear
  { emoji: '🦖', bg: 5 }, // t-rex
  { emoji: '🐝', bg: 6 }, // bee
  { emoji: '🏌️', bg: 2 }, // golfer
  { emoji: '⛹️', bg: 3 }, // basketball player
];

function avatarFor(index) {
  const i = Number.isInteger(index) && index >= 0 && index < AVATARS.length ? index : 0;
  return AVATARS[i];
}

// Point values by difficulty for the "+ Difficulty" scoring mode, ported
// from the single-device build.
const DIFFICULTY_POINTS = { easy: 100, medium: 150, hard: 200 };

// Session length, ported from the single-device build's setup screen: how
// many questions each round draws from the full content sets above (which
// are sized to exactly cover "long" with no repeats).
const LENGTH_CONFIG = {
  short: { numMain: 6, numLightning: 5, numDD: 1 },
  long: { numMain: 12, numLightning: 8, numDD: 2 },
};

function lengthConfigFor(length) {
  return LENGTH_CONFIG[length] || LENGTH_CONFIG.short;
}

const VALID_SCORING = ['correct', 'speed', 'speed_difficulty'];
const VALID_MODE = ['individual', 'team'];
const VALID_CATEGORIES = CATEGORY_WHEEL.map((w) => w.cat);

function normalizeSettings(raw) {
  const s = raw || {};
  // Host-selected Switchagories/Daily Double categories. Falls back to all
  // six whenever the list is missing, empty, or entirely invalid — a host
  // can never accidentally end up with zero categories to draw from.
  const requestedCats = Array.isArray(s.categories)
    ? s.categories.filter((c) => VALID_CATEGORIES.includes(c))
    : [];
  return {
    length: LENGTH_CONFIG[s.length] ? s.length : 'short',
    scoring: VALID_SCORING.includes(s.scoring) ? s.scoring : 'speed',
    // Team Huddle is reinstated as a selectable option but not yet wired to
    // real shared-team scoring — it plays identically to individual for now.
    mode: VALID_MODE.includes(s.mode) ? s.mode : 'individual',
    categories: requestedCats.length ? requestedCats : VALID_CATEGORIES.slice(),
  };
}

// Points for a correct Switchagories (main round) answer, ported verbatim
// from the single-device build's computeMainPoints — same three scoring
// modes, same math.
function computeMainPoints(qd, timeLeftPct, scoring) {
  if (scoring === 'correct') return 100;
  if (scoring === 'speed_difficulty') {
    const base = DIFFICULTY_POINTS[qd.diff] || 100;
    return base + Math.round(timeLeftPct * base);
  }
  return 100 + Math.round(timeLeftPct * 100); // 'speed' (default)
}

const QUESTION_TIME_MS = 18000; // matches the original build's MAIN_TIME (18s)
const LIGHTNING_TIME_MS = 4000; // matches the original build's LIGHTNING_TIME (4s)

// Wheel-spin transition timing — matches the single-device build so the
// pacing feels the same. The server holds the game in the 'wheel' phase for
// this long before it reveals the actual question, so every client's spin
// animation (which runs on its own clock) lands at roughly the same time.
const WHEEL_SPIN_MS = 3300;
const WHEEL_LAND_PAUSE_MS = 100;
// Tail padded by the client's ~420ms bounce-back settle (spin past the
// landing wedge, then spring back to it) so that finishes before the
// screen advances, on top of the original 1100ms admire-the-landed-wheel
// beat. This got doubled once already (to 6440ms) for a longer "admire the
// landed wheel" beat; this round, that same pause was called out as too
// long, so it's cut by 50% from that doubled value (not all the way back
// to the original 1520ms).
const WHEEL_TRANSITION_TAIL_MS = 3220;
const WHEEL_TOTAL_MS = WHEEL_SPIN_MS + WHEEL_LAND_PAUSE_MS + WHEEL_TRANSITION_TAIL_MS;

// How long the "Up next: CATEGORY" tile (with its photo background) stays up
// on its own screen after the wheel lands, before the question appears.
const CATEGORY_ANNOUNCE_MS = 1800;

// Player Roll Call fanfare, ported from the single-device build: once every
// player has pressed ready, each player's avatar pops in one at a time with
// a ship's-bell chime, then a "Let's Play!" title lands with a fanfare +
// crowd-cheer sting before the round actually begins. The single-device
// build played this BEFORE its (partly simulated) ready check; in real
// multiplayer the meaningful "everyone's actually here" moment is once
// every real player has pressed ready, so that's when this plays instead.
// Fixed length regardless of player count — the client spreads the
// per-player bell reveals evenly across whatever total it's given, so a
// 2-player room and an 8-player room both get the full length, just with
// wider or narrower gaps between each bell. Went 8s -> 16s -> back down to
// 12s per successive requests.
const ROLLCALL_FANFARE_MS = 12000;
function rollcallFanfareMs() {
  return ROLLCALL_FANFARE_MS;
}

// One-time round-intro title cards, each with their own independent
// duration (they used to share a single ROUND_INTRO_MS, but each has since
// been asked to change on its own): "SWITCHAGORIES" before the very first
// wheel spin, "LIGHTNING ROUND" before the first true/false statement, and
// "DAILY DOUBLE" (with its spotlight effect) before the first wager screen.
const SWITCHAGORIES_ROUND_INTRO_MS = 5200; // doubled from the original 2600
const LIGHTNING_ROUND_INTRO_MS = 5200; // doubled from the original 2600
const DD_ROUND_INTRO_MS = 5200; // doubled from the original 2600

// How long the "FINAL RESULTS" drum-roll fanfare plays before the scoreboard
// actually appears. Matches the single-device build's results transition.
const RESULTS_FANFARE_MS = 4200;

// How long a reveal screen stays up before the game auto-advances on its
// own — no host click required. Switchagories (main round) dropped from 6s
// to 5s; Lightning stays at the original 3s to keep that round feeling
// fast-paced, and so does Daily Double's reveal.
const REVEAL_HOLD_MS_MAIN = 5000;
const REVEAL_HOLD_MS_LIGHTNING = 3000;
const DD_REVEAL_HOLD_MS = 3000;

// Safety-net backstop for Daily Double: it's normally untimed (everyone
// wagers and answers on their own clock), but that means one player who
// never finishes — a dropped connection the heartbeat above hasn't caught
// yet, a client-side hiccup, someone who just got distracted — can leave
// the entire table stuck on "waiting for other players" with no way out
// short of the host's End Game button abandoning the whole game. This
// forces the reveal after a generous wait, treating anyone still not done
// as simply not having answered (existing scoring already handles that
// case cleanly — no wager change, shown as unanswered).
const DD_ANSWER_TIMEOUT_MS = 60000;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle a question's answer choices so the correct one isn't
// disproportionately likely to land in any one position — the hand-authored
// content leaned heavily on index 1 ("the second spot"). Applied once per
// question when a room's question sets are built for a fresh game, so the
// position varies from game to game rather than being baked into the data.
function shuffleChoices(item) {
  const order = shuffle(item.choices.map((_, i) => i));
  return Object.assign({}, item, {
    choices: order.map((i) => item.choices[i]),
    correct: order.indexOf(item.correct),
  });
}

// Draw `count` questions from the main pool with categories spread as
// evenly as possible, rather than a flat random slice (which, now that the
// pool is 240 questions across 6 categories, could easily hand a short game
// three Science questions and zero Sports). Shuffles each category's own
// question list, then takes one question per category in round-robin order
// — so a 6-question "short" game sees all 6 categories once, and a
// 12-question "long" game sees each category exactly twice, before the
// draw order itself is reshuffled so games don't always play the same
// wheel-spin sequence.
//
// `usedByCategory` is the room's own memory of which questions it has
// already shown, keyed by category (Map<category, Array<question text>>,
// oldest first — a FIFO, not a Set), and persists across "Play Again"
// within the same room. Per-game shuffling alone is genuinely random, but
// with a ~40-question pool per category, a specific question repeating
// within a handful of games is more common than it feels like it should be
// (birthday-paradox territory) — tracking history means nothing repeats
// until nearly every question in a category has been shown, then the
// oldest entries age out one at a time to make room for the next draw.
// That last part matters: an earlier version of this wiped a category's
// whole history at once when it ran low, which could — by pure bad luck
// right at that reset — let a question reappear on the very next game.
// Aging out the single oldest entry at a time instead means whatever was
// JUST shown always stays protected, so a repeat can never land sooner
// than "almost the entire pool has cycled."
function pickMainSet(pool, count, usedByCategory) {
  const byCat = {};
  pool.forEach((q) => {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });
  const cats = shuffle(Object.keys(byCat));
  // Leave at least this many unused questions per category so a draw never
  // runs dry mid-round-robin (a small margin over the per-category share,
  // since round-robin can hand one category an extra pick when count isn't
  // evenly divisible by the number of categories).
  const roughlyNeeded = Math.ceil(count / cats.length) + 1;
  cats.forEach((c) => {
    if (!usedByCategory[c]) usedByCategory[c] = [];
    const history = usedByCategory[c];
    const maxHistory = Math.max(0, byCat[c].length - roughlyNeeded);
    while (history.length > maxHistory) history.shift();
    const historySet = new Set(history);
    byCat[c] = shuffle(byCat[c].filter((q) => !historySet.has(q.q)));
  });
  const picked = [];
  let round = 0;
  while (picked.length < count) {
    let addedThisRound = false;
    for (const c of cats) {
      if (picked.length >= count) break;
      if (byCat[c][round]) {
        picked.push(byCat[c][round]);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break; // pool exhausted (shouldn't happen at our sizes)
    round++;
  }
  picked.forEach((q) => { usedByCategory[q.cat].push(q.q); });
  return shuffle(picked);
}

// Draw `count` Daily Double questions from the same pool as the main round
// (filtered to the host's selected categories), excluding whatever was
// already handed to this game's mainSet so nobody sees the same question
// twice in one sitting, AND whatever this room has already shown recently
// as a main or Daily Double question (the same usedByCategory history
// pickMainSet maintains) so Daily Double gets the same across-games
// freshness. Category balance doesn't matter here — it's only ever 1 or 2
// questions — so a plain random draw from whatever's left is enough; the
// history itself is trimmed back down to size on the next pickMainSet call.
function pickDailyDoubleSet(pool, mainSet, count, usedByCategory) {
  const usedThisGame = new Set(mainSet.map((q) => q.q));
  let remaining = pool.filter((q) => {
    if (usedThisGame.has(q.q)) return false;
    const history = usedByCategory[q.cat];
    return !history || !history.includes(q.q);
  });
  if (remaining.length < count) {
    // Safety net for a narrow category selection where history has eaten
    // through nearly the whole pool — fall back to anything not already
    // used in this specific game rather than coming up short.
    remaining = pool.filter((q) => !usedThisGame.has(q.q));
  }
  const picked = shuffle(remaining).slice(0, count);
  picked.forEach((q) => {
    if (!usedByCategory[q.cat]) usedByCategory[q.cat] = [];
    usedByCategory[q.cat].push(q.q);
  });
  return picked;
}

// Normalize the true/false items into the same {cat, q, choices, correct}
// shape the main round already uses, so every downstream function (wheel
// excluded) can treat both rounds identically. `usedLightning` is the same
// kind of cross-game FIFO memory as usedByCategory above, keyed by
// statement text, so Lightning gets the same no-early-repeats behavior.
function buildLightningSet(count, usedLightning) {
  const maxHistory = Math.max(0, LIGHTNING_ITEMS.length - count);
  while (usedLightning.length > maxHistory) usedLightning.shift();
  const historySet = new Set(usedLightning);
  const available = LIGHTNING_ITEMS.filter((item) => !historySet.has(item.s));
  const picked = shuffle(available).slice(0, count);
  picked.forEach((item) => usedLightning.push(item.s));
  return picked.map((item) => ({
    cat: 'Lightning',
    q: item.s,
    choices: ['True', 'False'],
    correct: item.truth ? 0 : 1,
  }));
}

// Same three wager tiers as the original build, computed from a player's
// own current score (so "All in" always means something, even at 0 points).
function wagerOptions(score) {
  const safe = Math.max(50, Math.round((score * 0.25) / 10) * 10);
  const bold = Math.max(100, Math.round((score * 0.5) / 10) * 10);
  const allIn = Math.max(150, score || 150);
  return [
    { label: 'Safe', amount: safe },
    { label: 'Bold', amount: bold },
    { label: 'All in', amount: allIn },
  ];
}

// In-memory room state.
// code -> {
//   players: Map(playerId -> { id, name, isHost, ws, score }),
//   phase: 'lobby' | 'rollcall' | 'rollcallFanfare' | 'wheel' | 'categoryAnnounce' | 'question' | 'reveal'
//          | 'roundIntro' | 'ddWager' | 'ddRoundReveal' | 'results' | 'ended',
//   round: 'main' | 'lightning' | 'dailyDouble'  (which set questionIndex indexes into)
//   mainSet: [question, ...]  (this room's shuffled order, set at startGame)
//   lightningSet: [question, ...]  (same shape as mainSet, set at startGame)
//   dailyDoubleSet: [question, ...]  (same shape, set at startGame)
//   questionIndex: number,
//   answers: Map(playerId -> choiceIndex),               // main/lightning rounds
//   ddWagers: Map(playerId -> amount)                     // current Daily Double item
//   ddCompleted: Map(playerId -> { correct, amount })     // current Daily Double item
//   readyPlayers: Set(playerId)                            // current rollcall
//   timer: Timeout | null,
// }
const rooms = new Map();

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  } while (rooms.has(code));
  return code;
}

function genPlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function roomSnapshot(room) {
  return Array.from(room.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    isHost: p.isHost,
    connected: !!p.ws,
    score: p.score,
    ready: room.readyPlayers ? room.readyPlayers.has(p.id) : false,
    lifelineUsed: !!p.lifelineUsed,
    avatar: p.avatar,
  }));
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(code, obj) {
  const room = rooms.get(code);
  if (!room) return;
  const payload = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
  }
}

function broadcastPlayers(code) {
  broadcast(code, { type: 'players', code, players: roomSnapshot(rooms.get(code)) });
}

function activeSet(room) {
  return room.round === 'lightning' ? room.lightningSet : room.mainSet;
}

function roundTimeMs(room) {
  return room.round === 'lightning' ? LIGHTNING_TIME_MS : QUESTION_TIME_MS;
}

function publicQuestion(room, index) {
  const set = activeSet(room);
  const q = set[index];
  // Includes live scores (players) so the question screen — not just
  // reveal — can keep the scoreboard visible, on a fresh broadcast or a
  // reconnect alike.
  return { index, total: set.length, cat: q.cat, q: q.q, choices: q.choices, timeMs: roundTimeMs(room), players: roomSnapshot(room) };
}

function answeredCount(room) {
  return room.answers.size;
}

// Wheel spin: a short, purely-decorative-but-synchronized transition that
// always lands on the real category of the upcoming question. Every client
// animates its own spin locally; the server just holds the game here for
// WHEEL_TOTAL_MS so everyone lands at roughly the same moment, then reveals
// the actual question. Only used for the Switchagories (main) round — the
// Lightning round moves straight from one statement to the next.
function startWheel(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'wheel';
  room.questionIndex = index;
  const target = room.mainSet[index];
  broadcast(code, { type: 'wheel', cat: target.cat, index, total: room.mainSet.length });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startCategoryAnnounce(code, index), WHEEL_TOTAL_MS);
}

// Its own screen, shown after the wheel lands and before the question: a
// full "Up next: CATEGORY" tile with that category's photo behind it —
// distinct from the wheel screen itself, matching the single-device build.
function startCategoryAnnounce(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'categoryAnnounce';
  room.questionIndex = index;
  const target = room.mainSet[index];
  broadcast(code, { type: 'categoryAnnounce', cat: target.cat, index, total: room.mainSet.length });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startQuestion(code, index), CATEGORY_ANNOUNCE_MS);
}

// Pre-game roll call: every connected player (host included) has to press
// Ready before Switchagories begins. Only currently-connected players are
// required, so someone who never loads the page can't block the table
// forever, mirroring how the Daily Double "everyone's turn" gate works.
function startRollCall(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'rollcall';
  room.readyPlayers = new Set();
  clearTimeout(room.timer);
  room.timer = null;
  broadcast(code, { type: 'rollcall', players: roomSnapshot(room) });
}

function maybeAdvanceRollCall(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== 'rollcall') return;
  const connected = Array.from(room.players.values()).filter((p) => p.ws);
  if (!connected.length) return;
  const allReady = connected.every((p) => room.readyPlayers.has(p.id));
  if (!allReady) return;
  // Everyone's actually here and ready — this is the "let's play!" moment.
  // Hold in a dedicated phase for the roll-call fanfare (per-player bell
  // reveal + title card) before the round itself begins.
  room.phase = 'rollcallFanfare';
  const fanfareMs = rollcallFanfareMs(connected.length);
  room.rollcallFanfareEndsAt = Date.now() + fanfareMs;
  broadcast(code, { type: 'rollcallFanfare', players: roomSnapshot(room), fanfareMs });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startSwitchagoriesIntro(code), fanfareMs);
}

// One-time title card shown before the very first Switchagories wheel spin
// of the game (or replay). Every subsequent question in the round reuses
// the plain wheel spin — this is just the round's opening beat.
function startSwitchagoriesIntro(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.round = 'main';
  room.phase = 'roundIntro';
  broadcast(code, {
    type: 'roundIntro',
    title: 'SWITCHAGORIES',
    subtitle: 'Multiple choice. Multiple topics.',
    theme: 'catclash',
    icon: '🎡',
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startWheel(code, 0), SWITCHAGORIES_ROUND_INTRO_MS);
}

// One-time title card shown before the Lightning round begins (no per-item
// wheel spin — the original build only transitions once for this round).
function startLightningRound(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.round = 'lightning';
  room.phase = 'roundIntro';
  broadcast(code, {
    type: 'roundIntro',
    title: 'LIGHTNING ROUND',
    subtitle: 'True or false — answer fast!',
    theme: 'lightning',
    icon: '⚡',
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startQuestion(code, 0), LIGHTNING_ROUND_INTRO_MS);
}

function startQuestion(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'question';
  room.questionIndex = index;
  room.answers = new Map();
  room.answerAt = new Map();
  room.questionStartAt = Date.now();
  broadcast(code, {
    type: 'question',
    ...publicQuestion(room, index),
    answeredCount: 0,
    playerCount: room.players.size,
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => revealAnswer(code), roundTimeMs(room));
}

function revealAnswer(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== 'question') return;
  clearTimeout(room.timer);
  room.phase = 'reveal';

  const set = activeSet(room);
  const q = set[room.questionIndex];
  const answerMap = {};
  for (const [playerId, choice] of room.answers.entries()) {
    answerMap[playerId] = choice;
    if (choice === q.correct) {
      const player = room.players.get(playerId);
      if (!player) continue;
      if (room.round === 'main') {
        // Speed component matches the single-device build: 1.0 = answered
        // instantly, 0 = answered right as time ran out.
        const answeredAt = room.answerAt.get(playerId) || Date.now();
        const elapsed = Math.max(0, answeredAt - (room.questionStartAt || answeredAt));
        const timeLeftPct = Math.max(0, Math.min(1, 1 - elapsed / QUESTION_TIME_MS));
        player.score += computeMainPoints(q, timeLeftPct, room.settings.scoring);
      } else {
        // Lightning round: flat points regardless of scoring mode, same as
        // the single-device build.
        player.score += 50;
      }
    }
  }

  const isLastInRound = room.questionIndex >= set.length - 1;
  const holdLabel = room.round === 'main'
    ? (isLastInRound ? 'Lightning Round starting' : 'Next question')
    : (isLastInRound ? 'Daily Double starting' : 'Next question');
  const holdMs = room.round === 'main' ? REVEAL_HOLD_MS_MAIN : REVEAL_HOLD_MS_LIGHTNING;

  broadcast(code, {
    type: 'reveal',
    index: room.questionIndex,
    cat: q.cat,
    correct: q.correct,
    answers: answerMap,
    players: roomSnapshot(room),
    holdLabel,
    holdMs,
  });

  room.timer = setTimeout(() => advanceAfterReveal(code), holdMs);
}

// Auto-advances past a main/lightning reveal — no host click needed. Called
// once from a server timer set right after the 'reveal' broadcast above.
function advanceAfterReveal(code) {
  const room = rooms.get(code);
  if (!room) return;
  const next = room.questionIndex + 1;
  if (room.round === 'main') {
    if (next >= room.mainSet.length) {
      startLightningRound(code);
    } else {
      startWheel(code, next);
    }
  } else if (room.round === 'lightning') {
    if (next >= room.lightningSet.length) {
      startDailyDoubleRoundIntro(code);
    } else {
      startQuestion(code, next);
    }
  }
}

// One-time title card before the Daily Double round begins.
function startDailyDoubleRoundIntro(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.round = 'dailyDouble';
  room.phase = 'roundIntro';
  broadcast(code, {
    type: 'roundIntro',
    title: 'DAILY DOUBLE',
    subtitle: 'Wager your own points — before you see the question.',
    theme: 'dailydouble',
    icon: '💰',
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => startDailyDoubleItem(code, 0), DD_ROUND_INTRO_MS);
}

// Daily Double is untimed and personal: every player wagers off their own
// score and answers at their own pace, rather than everyone racing a shared
// clock. The question itself is only revealed to a player once THEY lock in
// a wager — that's the whole point of the format.
function startDailyDoubleItem(code, index) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'ddWager';
  room.questionIndex = index;
  room.ddWagers = new Map();
  room.ddCompleted = new Map();
  clearTimeout(room.timer);
  for (const p of room.players.values()) {
    send(p.ws, { type: 'ddWager', index, total: room.dailyDoubleSet.length, options: wagerOptions(p.score) });
  }
  // Safety net — see DD_ANSWER_TIMEOUT_MS above. Cleared and replaced the
  // moment everyone actually finishes (revealDailyDouble below always does
  // clearTimeout(room.timer) first), so this only ever fires if the table
  // is genuinely still waiting on someone after a full minute.
  room.timer = setTimeout(() => revealDailyDouble(code, { force: true }), DD_ANSWER_TIMEOUT_MS);
}

// Checks whether every currently-connected player has finished (wagered and
// answered) the active Daily Double item, and reveals the shared results
// once they have. Only connected players count, so someone who dropped
// mid-round never blocks the rest of the table forever — and even a
// connection the server hasn't yet noticed is dead gets caught by the
// DD_ANSWER_TIMEOUT_MS backstop in startDailyDoubleItem above.
function maybeRevealDailyDouble(code) {
  revealDailyDouble(code, { force: false });
}

function revealDailyDouble(code, opts) {
  const room = rooms.get(code);
  if (!room || room.phase !== 'ddWager') return;
  if (!opts || !opts.force) {
    const connected = Array.from(room.players.values()).filter((p) => p.ws);
    if (!connected.length) return;
    const allDone = connected.every((p) => room.ddCompleted.has(p.id));
    if (!allDone) return;
  }

  clearTimeout(room.timer);
  room.phase = 'ddRoundReveal';
  const item = room.dailyDoubleSet[room.questionIndex];
  const results = Array.from(room.players.values()).map((p) => {
    const r = room.ddCompleted.get(p.id);
    return { id: p.id, name: p.name, avatar: p.avatar, wager: r ? r.amount : 0, correct: r ? r.correct : null, answered: !!r };
  });
  const isLastInRound = room.questionIndex >= room.dailyDoubleSet.length - 1;
  broadcast(code, {
    type: 'ddRoundReveal',
    index: room.questionIndex,
    total: room.dailyDoubleSet.length,
    q: item.q,
    choices: item.choices,
    correctIndex: item.correct,
    results,
    players: roomSnapshot(room),
    holdLabel: isLastInRound ? 'Final results coming up' : 'Next Daily Double',
    holdMs: DD_REVEAL_HOLD_MS,
  });

  room.timer = setTimeout(() => advanceAfterDailyDouble(code), DD_REVEAL_HOLD_MS);
}

// Auto-advances past a Daily Double reveal — no host click needed.
function advanceAfterDailyDouble(code) {
  const room = rooms.get(code);
  if (!room) return;
  const next = room.questionIndex + 1;
  if (next >= room.dailyDoubleSet.length) {
    startResultsFanfare(code);
  } else {
    startDailyDoubleItem(code, next);
  }
}

// One-time "FINAL RESULTS" fanfare (drum-roll build + crash, synthesized
// client-side — no asset file) shown right before the final scoreboard.
// Scores are already final by this point; this is purely a beat of drama
// before everyone sees where they landed.
function startResultsFanfare(code) {
  const room = rooms.get(code);
  if (!room) return;
  room.phase = 'results';
  clearTimeout(room.timer);
  broadcast(code, { type: 'results' });
  room.timer = setTimeout(() => {
    room.phase = 'ended';
    broadcast(code, { type: 'ended', players: roomSnapshot(room) });
  }, RESULTS_FANFARE_MS);
}

wss.on('connection', (ws) => {
  let myRoomCode = null;
  let myPlayerId = null;

  ws.isAlive = true;
  ws.on('pong', heartbeatPong);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    if (msg.type === 'host') {
      const name = String(msg.name || 'Player').slice(0, 20) || 'Player';
      const code = genCode();
      const playerId = genPlayerId();
      const settings = normalizeSettings(msg.settings);
      const room = {
        players: new Map(),
        phase: 'lobby',
        round: 'main',
        settings,
        mainSet: [],
        lightningSet: [],
        dailyDoubleSet: [],
        questionIndex: -1,
        questionStartAt: null,
        answers: new Map(),
        answerAt: new Map(),
        ddWagers: new Map(),
        ddCompleted: new Map(),
        readyPlayers: new Set(),
        timer: null,
        // Cross-game "already shown" memory for this room — see
        // pickMainSet/pickDailyDoubleSet/buildLightningSet. Persists across
        // Play Again so questions don't repeat until each pool cycles.
        // Both are FIFOs (oldest-shown-first), not Sets — see the long
        // comment above pickMainSet for why that distinction matters.
        usedByCategory: {},
        usedLightning: [],
      };
      room.players.set(playerId, { id: playerId, name, isHost: true, ws, score: 0, lifelineUsed: false, avatar: avatarFor(msg.avatarIndex) });
      rooms.set(code, room);
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, { type: 'room', code, playerId, isHost: true, phase: room.phase, players: roomSnapshot(room), settings: room.settings });
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').toUpperCase();
      const name = String(msg.name || 'Player').slice(0, 20) || 'Player';
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'No room found with code ' + code + '.' });
        return;
      }
      const playerId = genPlayerId();
      room.players.set(playerId, { id: playerId, name, isHost: false, ws, score: 0, lifelineUsed: false, avatar: avatarFor(msg.avatarIndex) });
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, {
        type: 'room',
        code,
        playerId,
        isHost: false,
        phase: room.phase,
        players: roomSnapshot(room),
        settings: room.settings,
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room, room.questionIndex) : null,
      });
      broadcastPlayers(code);
      return;
    }

    if (msg.type === 'rejoin') {
      const code = String(msg.code || '').toUpperCase();
      const playerId = String(msg.playerId || '');
      const room = rooms.get(code);
      if (!room || !room.players.has(playerId)) {
        send(ws, { type: 'error', message: 'That room is no longer available — join fresh.' });
        return;
      }
      const player = room.players.get(playerId);
      player.ws = ws;
      myRoomCode = code;
      myPlayerId = playerId;
      send(ws, {
        type: 'room',
        code,
        playerId,
        isHost: player.isHost,
        phase: room.phase,
        players: roomSnapshot(room),
        settings: room.settings,
        question: room.phase === 'question' || room.phase === 'reveal' ? publicQuestion(room, room.questionIndex) : null,
        alreadyAnswered: room.answers.has(playerId),
      });
      broadcastPlayers(code);
      // Daily Double gates on every connected player finishing their turn —
      // if a reconnecting player never gets back their wager/question step,
      // the whole round hangs forever with no way for the host to force it
      // along. Re-send whatever step they were on so they can finish it.
      if (room.phase === 'ddWager' && !room.ddCompleted.has(playerId)) {
        if (room.ddWagers.has(playerId)) {
          const item = room.dailyDoubleSet[room.questionIndex];
          send(ws, { type: 'ddQuestion', q: item.q, choices: item.choices, wager: room.ddWagers.get(playerId), players: roomSnapshot(room) });
        } else {
          send(ws, { type: 'ddWager', index: room.questionIndex, total: room.dailyDoubleSet.length, options: wagerOptions(player.score) });
        }
      }
      // Same idea for the roll call: the whole table waits for every
      // connected player to press Ready, so a reconnecting player needs
      // that screen re-sent or the game could hang on them indefinitely.
      if (room.phase === 'rollcall') {
        send(ws, { type: 'rollcall', players: roomSnapshot(room) });
      }
      // Reconnecting mid-fanfare: send whatever time is actually left so the
      // bell/title sequence doesn't restart from the top (or, if it already
      // finished server-side, resolves to a near-zero hold and the client's
      // own phase message a moment later carries it straight into the round).
      if (room.phase === 'rollcallFanfare') {
        const remaining = Math.max(300, (room.rollcallFanfareEndsAt || Date.now()) - Date.now());
        send(ws, { type: 'rollcallFanfare', players: roomSnapshot(room), fanfareMs: remaining });
      }
      return;
    }

    if (msg.type === 'startGame') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      const player = room.players.get(myPlayerId);
      if (!player || !player.isHost || room.phase !== 'lobby') return;
      room.round = 'main';
      const cfg = lengthConfigFor(room.settings.length);
      // Both Switchagories and Daily Double draw from whichever categories
      // the host left selected (normalizeSettings guarantees at least one).
      const categoryPool = MAIN_QUESTIONS.filter((q) => room.settings.categories.includes(q.cat));
      room.mainSet = pickMainSet(categoryPool, cfg.numMain, room.usedByCategory).map(shuffleChoices);
      // Lightning items are always True/False in that fixed order — unlike
      // Switchagories' multiple-choice questions, there's no "always lands
      // in the same spot" bias to fix here, and shuffling was actually
      // making it swap sides from item to item, which read as confusing
      // rather than fair. Left un-shuffled on purpose (per request).
      room.lightningSet = buildLightningSet(cfg.numLightning, room.usedLightning);
      room.dailyDoubleSet = pickDailyDoubleSet(categoryPool, room.mainSet, cfg.numDD, room.usedByCategory).map(shuffleChoices);
      startRollCall(myRoomCode);
      return;
    }

    if (msg.type === 'ready') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId || room.phase !== 'rollcall') return;
      room.readyPlayers.add(myPlayerId);
      broadcast(myRoomCode, { type: 'rollcall', players: roomSnapshot(room) });
      maybeAdvanceRollCall(myRoomCode);
      return;
    }

    if (msg.type === 'answer') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      if (room.phase !== 'question') return;
      if (room.answers.has(myPlayerId)) return; // one answer per question
      const choice = Number(msg.choice);
      const numChoices = activeSet(room)[room.questionIndex].choices.length;
      if (!Number.isInteger(choice) || choice < 0 || choice >= numChoices) return;
      room.answers.set(myPlayerId, choice);
      room.answerAt.set(myPlayerId, Date.now());
      broadcast(myRoomCode, {
        type: 'answerCount',
        answeredCount: answeredCount(room),
        playerCount: room.players.size,
      });
      if (answeredCount(room) >= room.players.size) {
        revealAnswer(myRoomCode);
      }
      return;
    }

    // 50/50 lifeline: Switchagories only, one use per game per player. Picks
    // 2 of the (3) wrong choices to hide and tells only the requesting
    // player — it's personal, not a shared room-wide effect.
    if (msg.type === 'useLifeline') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      if (room.phase !== 'question' || room.round !== 'main') return;
      const player = room.players.get(myPlayerId);
      if (!player || player.lifelineUsed) return;
      if (room.answers.has(myPlayerId)) return; // can't use after answering
      player.lifelineUsed = true;
      const q = activeSet(room)[room.questionIndex];
      const wrongIdx = [];
      q.choices.forEach((c, i) => { if (i !== q.correct) wrongIdx.push(i); });
      const hideIndices = shuffle(wrongIdx).slice(0, 2);
      send(ws, { type: 'lifelineResult', hideIndices });
      return;
    }

    // Lets the host cut a game short from any in-progress screen and jump
    // straight to final results — same drum-roll-into-scoreboard flow as a
    // game that finishes normally, just triggered early. Scores are
    // whatever they currently are; nothing needs to be undone or
    // recomputed, since results are always read live off each player's
    // running score.
    if (msg.type === 'endGame') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      const player = room.players.get(myPlayerId);
      if (!player || !player.isHost) return;
      if (room.phase === 'lobby' || room.phase === 'results' || room.phase === 'ended') return;
      startResultsFanfare(myRoomCode);
      return;
    }

    if (msg.type === 'playAgain') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId) return;
      const player = room.players.get(myPlayerId);
      if (!player || !player.isHost || room.phase !== 'ended') return;
      room.phase = 'lobby';
      room.round = 'main';
      room.questionIndex = -1;
      room.answers = new Map();
      room.answerAt = new Map();
      room.questionStartAt = null;
      room.ddWagers = new Map();
      room.ddCompleted = new Map();
      room.readyPlayers = new Set();
      clearTimeout(room.timer);
      room.timer = null;
      for (const p of room.players.values()) { p.score = 0; p.lifelineUsed = false; }
      broadcast(myRoomCode, { type: 'backToLobby', players: roomSnapshot(room) });
      return;
    }

    if (msg.type === 'ddWagerLock') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId || room.phase !== 'ddWager') return;
      const player = room.players.get(myPlayerId);
      if (!player || room.ddWagers.has(myPlayerId)) return;
      const valid = wagerOptions(player.score).map((o) => o.amount);
      const amount = Number(msg.amount);
      if (!valid.includes(amount)) return;
      room.ddWagers.set(myPlayerId, amount);
      const item = room.dailyDoubleSet[room.questionIndex];
      send(ws, { type: 'ddQuestion', q: item.q, choices: item.choices, wager: amount, players: roomSnapshot(room) });
      return;
    }

    if (msg.type === 'ddAnswer') {
      const room = rooms.get(myRoomCode);
      if (!room || !myPlayerId || room.phase !== 'ddWager') return;
      if (!room.ddWagers.has(myPlayerId) || room.ddCompleted.has(myPlayerId)) return;
      const player = room.players.get(myPlayerId);
      if (!player) return;
      const item = room.dailyDoubleSet[room.questionIndex];
      const choice = Number(msg.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= item.choices.length) return;
      const wager = room.ddWagers.get(myPlayerId);
      const correct = choice === item.correct;
      if (correct) player.score += wager;
      else player.score = Math.max(0, player.score - wager);
      room.ddCompleted.set(myPlayerId, { correct, amount: wager });
      send(ws, { type: 'ddPersonalResult', correct, amount: wager, correctIndex: item.correct, newScore: player.score });
      broadcastPlayers(myRoomCode);
      maybeRevealDailyDouble(myRoomCode);
      return;
    }
  });

  ws.on('close', () => {
    if (!myRoomCode || !myPlayerId) return;
    const room = rooms.get(myRoomCode);
    if (!room) return;
    const player = room.players.get(myPlayerId);
    if (player) {
      player.ws = null;
      broadcastPlayers(myRoomCode);
      if (room.phase === 'ddWager') maybeRevealDailyDouble(myRoomCode);
      if (room.phase === 'rollcall') maybeAdvanceRollCall(myRoomCode);
    }
    const codeAtClose = myRoomCode;
    setTimeout(() => {
      const r = rooms.get(codeAtClose);
      if (!r) return;
      const anyConnected = Array.from(r.players.values()).some((p) => p.ws);
      if (!anyConnected) {
        clearTimeout(r.timer);
        rooms.delete(codeAtClose);
      }
    }, 10 * 60 * 1000); // 10 minutes
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Trivia Night server listening on port ' + PORT);
});
