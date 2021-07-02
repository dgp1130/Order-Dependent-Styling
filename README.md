# Order Dependent Styling

Order-dependent styles are considered an anti-pattern. They can cause tricky
issues with bundlers which may not keep order stable during compilation and tend
to be very tricky to debug.

This is a proof-of-concept tool which loads a web page in Puppeteer and scans
all the nodes of the DOM to look for any which have a style set by multiple CSS
rules using order-dependent selectors. Prints any findings to stderr and exits
with a non-zero status code if any are found.
