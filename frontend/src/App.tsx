/*

  What is this component's job?
  1. Hold all the state 
  2. Conditionally display components based on state
  3. Pass props (data and functions) into child components


  What does this component need to receive?
  Nothing - this is the top-most/root component so it is the owner of the data 
  props don't need to be passed down like they do in child components


  What does it need to remember?
  The main page remembers everything, all the state variables and functions needed for the 
  application originate and are remembered here (passed down via props)


  What does it show?
  The page will keep the same structure but will display components conditionally based
  on user actions


  What does it send?
  Nothing, the main page doesn't pass/send anything to a parent component because its already 
  at the top 

*/

import Button from "./components/ui/Button";

function App() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8">
      <h1 className="text-5xl font-bold">SkillSync</h1>
      <Button>Upload Resume</Button>
    </main>
  );
}

export default App;
