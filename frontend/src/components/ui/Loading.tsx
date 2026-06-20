/*

    What is this component's job?
    To display a loading spinner to the user, indicating that their request is in the process of being handled -
    shows the user the application is busy not broken


    What does this component need to receive?
    This is a generic spinner that functions the same regardless so it needs to props/receives nothing


    What does it need to remember?
    No it doesn't track anything, change over time or handle input, its just conditional content display so 
    there is nothing it needs to remember/no state


    What does it show?
    A loading display - a message, or a loading wheel, or a timer emoji

    What does it send back?
    The loading component sends nothing back to it's parent - its purely display so theres nothing to send back 

*/

/*

  LOADING SPINNER — how this works

  WHAT IT IS:
    A spinner is just a CIRCLE with ONE edge a different color,
    ROTATING continuously. The spinning colored edge is what
    creates the "loading" look.

  WHY A <div> WITH NO CONTENT:
    The div is empty because it's not showing text - it's a SHAPE.
    The Tailwind classes turn this plain div into a spinning circle.

  THE TAILWIND CLASSES (what each one does):

    animate-spin
      -> Tailwind's built-in spinning animation (rotates it forever).
         This is the part that actually makes it SPIN.
         (Without Tailwind, this would need custom CSS @keyframes)

    rounded-full
      -> makes the div a CIRCLE (rounds corners fully)
         (plain CSS equivalent: border-radius: 50%)

    h-10  w-10
      -> height and width (the SIZE of the circle)
         (Tailwind sizing: 10 = 2.5rem = 40px)

    border-4
      -> puts a border all the way around (thickness 4)
         this border is what we SEE as the ring

    border-green-200
      -> the color of the FULL ring (light green)
    border-t-green-700
      -> makes just the TOP edge green (different from the rest)
         THIS is the trick: one colored edge spinning around
         is what makes it read as a loading spinner

  THE WHOLE EFFECT:
    gray ring (border-green-200)
    + one green edge (border-t-green-700)
    + spinning forever (animate-spin)
    = a loading spinner

  NOTES:
    - This is a generic spinner: no props, no state, just displays
    - Colors/size (green, 40px) can be tweaked to match the app's design later
    - Used via conditional render in App.tsx:
        {isLoading ? <Loading /> : <AnalysisResult ... />}
        
*/


function Loading() {
  return (
    <div 
      className="animate-spin rounded-full h-5 w-5 border-4 border-green-200 border-t-green-700"
      role="status"
      aria-label="Loading"
    ></div>
  )
}

export default Loading