// Question bank for the game
// XX will be replaced with player names

const QUESTIONS = [
  "What's XX's favorite place to poop?",
  "If XX had a time machine, who would you go back in time to kill?",
  "If XX had bigger balls, I would have told that cop who pulled me over _____",
  "Where does XX spend most of their time these days?",
  "What's XX's favorite thing to eat on your burger?",
  "Name something XX used to do in recess?",
  "What are you spending money on that you're so broke?",
  "What was the most famous tattoo in 2020",
  "Name something you're afraid of",
  "What is XX too scared to eat",
  "Name something that goes good with alcohol",
  "Name a place that's great for a first date",
  "XX went on a themed cruise. What was the theme?",
  "Where do you wish you could go on a honeymoon if you had over $5000?",
  "What's the first thing XX thinks when they wake up in the morning?",
  "What's XX's go-to dinner?",
  "What's your least favorite law?",
  "If you could go back in time, who would you kill?",
  "What's XX's secret to looking good?",
  "What's XX's first crush?",
  "One time XX hit ___ with its car but never got caught",
  "One time XX woke up from a hangover in ___ but wasn't sure how they got there.",
  "That time XX got their car searched by the cops and found ___ in the trunk…",
  "XX beat the shit out of a cop using a ___. It was bad. But they escaped so it was cool.",
  "XX once got caught ___ on the job.",
  "XX was caught ___ while on annual family fishing trip. They were never invited back.",
  "XX once ran into Obama at ___",
  "Trump's lawyers have a restraining order against XX because ___",
  "XX has secretly been recording an RNB album in their room. The hit song is titled ___",
  "XX sees dead people. They see them in ___",
  "XX marries just for their ___",
  "XX can breakdance but they can't ___",
  "XX likes to sing ___ but they honestly sound like shit",
  "XX would rather fucking die than spend one more minute ___",
  "XX can't keep their mind off of ___ lower region",
  "XX once ate two ___ in one day and still later ate a burrito",
  "XX is secretly scared of ___",
  "XX can't stop doodling their name + ___ with hearts",
  "XX holds in their farts until they can get __",
  "XX wishes they had more hair on their ___",
  "XX once drove a car into a ___. Actually it was just a brick on the gas peddle. XX was fine. But everyone else got pretty fucking hurt.",
  "XX would rather spend a night on the couch again than admit they ___",
  "XX would rather get unvaccinated and spend a night in Miami than spend one more minute in a ___",
  "XX dunks ___ in their coffee",
  "When XX takes their gun to the range, they use ___ for target practice",
  "XX cries every time the song ___ comes on the radio",
  "XX cries every time their mind wanders and they remember ___",
  "Can you believe what XX did ___ at summer camp?",
  "XX has a ___ with your name on it",
  "XX slashed someone's tires because they ___",
  "XX got black out drunk and thought ___ was a bathroom",
  "XX photoshops themselves ___ and posts it on social media but the shops look fake as fuck",
  "XX claims they're not wearing a __ but like it's pretty fucking obvious and XX isn't fucking fooling anybody",
  "XX always finds a way to work  ___ into basically every fucking conversation",
  "Once at their BBQ, XX told everyone the secret to the food was __ and everyone just left for the emergency room to get their stomachs pumped",
  "XX believes leprechauns, unicorns and ___ are real",
  "XX thinks parenting is hard but they've never experienced ___",
  "XX thinks they once saw a UFO but they were just drunk and it was a ___",
  "XX never washes their hands after they ___",
  "What's the same thing XX confesses every Sunday at Church?",
  "If XX were an animal what animal would they be and why?",
  "If XX could choose a new career in life, what should they be?",
  "If XX suddenly won the lottery, what would they buy first?",
  "What was the reason XX recently went to the doctor?",
  "XX would never admit to voting for ___ but honestly, we all knew",
  "XX is a secret spy for ___ and spends their free time drinking whiskey singing about the old country next to their fireplace",
  "If XX were an Avenger, their super power would be __",
  "If XX were to rob a bank, what would they use as a mask?",
  "XX dips their fries in ___",
  "XX donated ___ to cars for kids instead of a car"
];

/**
 * Get a random question
 */
function getRandomQuestion() {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

/**
 * Replace XX placeholder with a player name
 */
function replacePlayerName(question, playerName) {
  return question.replace(/XX/g, playerName);
}

module.exports = {
  getRandomQuestion,
  replacePlayerName
};
