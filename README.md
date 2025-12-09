The goal is to build a Chrome extension that will take a GitHub Co-pilot review and turn it into a prompts.  The copilot builds up a html page with a number of elements - <turbo-frame id="review-thread-or-comment-id-1694119370" target="_top">

The extension would enumerate all of these turo frames and extract the following bits if information:

File name - #review-thread-or-comment-id-1694119370 > details-collapsible > details-toggle > details > summary > div > span > a

Line numbers - #review-thread-or-comment-id-1694119370 > details-collapsible > details-toggle > details > div > div.f6.py-2.px-3.border-bottom.d-flex.flex-justify-between > div

Code mentioned - #review-thread-or-comment-id-1694119370 > details-collapsible > details-toggle > details > div > div.blob-wrapper.border-bottom > table

Comment - #discussion_r2594756606 > div:nth-child(2) > div.edit-comment-hide > task-lists
