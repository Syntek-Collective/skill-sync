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

/*

  State
  What does the app need to track over time (and change the UI based on)?

  Since this application relies on conditional rendering 

*/

import Button from "./components/ui/Button";


function App() {
  return (
    <div>
      <Button>Upload Resume</Button>
    </div>
      
  );
}

export default App;
