/*

    What is this file for?
    The GOLDEN DATASET - our set of known-good test cases used to evaluate how well 
    the AI is performing. Each case is an example input (resume + job posting) paired 
    with the IDEAL/expected analysis we'd want the AI to produce.

    What does it do?
    It doesn't run anything itself - it's the DATA we test against. An eval script runs 
    the AI on each case and compares the AI's actual output to the expected output here, 
    so we can measure if the AI is doing a good job (and catch it if it gets worse).

    Why it matters:
    Without a golden dataset we'd just be guessing whether the AI is "good." This gives 
    us a real, repeatable way to check quality - and it's a key thing that makes this 
    project stand out (a real evaluation layer, not just vibes).

*/