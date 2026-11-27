/**
 * Site content for every page: titles, meta descriptions, H1s, help text,
 * FAQ (also emitted as FAQPage JSON-LD) and related-tool links.
 *
 * Pure data with no browser or Node APIs, so it can be imported by
 * vite.config.js (build-time page rendering), the runtime, and tests.
 */

export const SITE = {
  brand: 'Fileward',
  tagline: 'Your files stay yours.',
  repo: 'private-file-toolkit',
  owner: 'lance6x5',
  base: '/private-file-toolkit/',
  origin: 'https://lance6x5.github.io',
  studio: 'Silverlight DevTech',
  homepage: 'https://lance6x5.github.io/',
  themeLight: '#9f1d4f',
  themeDark: '#1a1218'
};

export const SITE_URL = `${SITE.origin}${SITE.base}`;
export const REPO_URL = `https://github.com/${SITE.owner}/${SITE.repo}`;

/** The privacy badge shown on every tool. Keep in sync with README. */
export const BADGE_TEXT = 'Processed on your device. Your files are never uploaded.';

/**
 * Tool pages, in header order. `slug` is also the folder name
 * (e.g. merge-pdf/index.html -> /private-file-toolkit/merge-pdf/).
 */
export const TOOLS = [
  {
    slug: 'merge-pdf',
    nav: 'Merge PDF',
    group: 'PDF',
    title: 'Merge PDF Files – Free, No Upload, Works Offline | Fileward',
    description: 'Combine multiple PDFs into one in your browser. Drag to reorder, merge and download. Free, private and offline: your PDFs are never uploaded.',
    h1: 'Merge PDF files',
    lead: 'Drop two or more PDFs, drag them into order and merge them into a single file.',
    card: 'Combine several PDFs into one, in the order you choose.',
    related: ['split-pdf', 'organize-pdf', 'redact-pdf'],
    help: [
      'Drop your PDFs onto the box above (or click it to pick files). Drag the list items, or use the up and down buttons, to set the order, then press Merge. The merged PDF downloads straight from your browser.',
      'Most online PDF mergers upload your documents to a server. Contracts, bank statements and medical letters do not belong on someone else’s computer. Fileward runs the merge with pdf-lib inside your browser, so the files never leave your device.',
      'Pages keep their original size, orientation and content. Document properties such as title and author are not copied into the merged file.'
    ],
    faq: [
      ['Is there a limit on how many PDFs I can merge?', 'There is no fixed count. The limit is your device’s memory; Fileward shows the per-file size limit for your device and warns you before anything goes wrong.'],
      ['Are my PDFs uploaded anywhere?', 'No. Merging happens in a Web Worker inside your browser. You can load the page, switch off Wi-Fi, and it still works.'],
      ['Can I merge password-protected PDFs?', 'Not yet. Remove the password in your PDF reader first, then merge.'],
      ['Will links and bookmarks survive?', 'Page content is kept exactly. Document-level bookmarks are not carried over to the merged file.']
    ]
  },
  {
    slug: 'split-pdf',
    nav: 'Split PDF',
    group: 'PDF',
    title: 'Split PDF – Extract Pages Free, No Upload, Offline | Fileward',
    description: 'Extract a page range or split every page of a PDF into separate files, downloaded as a ZIP. Runs in your browser: no upload, works offline.',
    h1: 'Split PDF and extract pages',
    lead: 'Pull out a page range, or split a PDF into single pages or equal chunks.',
    card: 'Extract page ranges or split every page into its own file.',
    related: ['merge-pdf', 'organize-pdf', 'compress-image'],
    help: [
      'Drop a PDF, then choose a mode. "Extract pages" takes a list like 1-3, 5, 8- and builds one new PDF from those pages, in that order. "Split every page" makes one file per page. "Split every N pages" cuts the document into equal chunks.',
      'When there is more than one output file you can download them individually or all at once as a ZIP, which is also built on your device.',
      'Your PDF is never sent to a server. Splitting runs with pdf-lib in a background thread, so even large files will not freeze the page.'
    ],
    faq: [
      ['How do I write a page range?', 'Use commas and dashes: "1-3, 5, 9-12". A range with no end, like "8-", runs to the last page. Pages are numbered from 1.'],
      ['Does splitting reduce quality?', 'No. Pages are copied as-is; nothing is re-compressed or rasterized.'],
      ['Is my PDF uploaded?', 'No. Everything happens in your browser and the tool works offline after the first visit.']
    ]
  },
  {
    slug: 'organize-pdf',
    nav: 'Reorder pages',
    group: 'PDF',
    title: 'Reorder, Rotate & Delete PDF Pages – Free, No Upload | Fileward',
    description: 'Rearrange PDF pages with a drag-and-drop thumbnail grid, rotate or delete pages, then download. Private and offline: nothing is uploaded.',
    h1: 'Reorder, rotate and delete PDF pages',
    lead: 'See every page as a thumbnail, drag pages into a new order, rotate or remove them.',
    card: 'Drag thumbnails to reorder, rotate or delete pages.',
    related: ['merge-pdf', 'split-pdf', 'redact-pdf'],
    help: [
      'Drop a PDF to see a thumbnail of every page. Drag a thumbnail to move it, or use the arrow buttons on each page if you prefer the keyboard. Rotate pages a quarter turn at a time, or mark them for deletion.',
      'Press "Save PDF" to build the new document. Rotation is stored losslessly, so text stays sharp and searchable.',
      'Thumbnails are drawn with pdf.js and the new file is written with pdf-lib, both running locally. Your document never leaves the browser.'
    ],
    faq: [
      ['Is rotating a page lossless?', 'Yes. Fileward changes the page’s rotation setting rather than re-drawing it, so nothing is re-compressed.'],
      ['Can I undo a deletion?', 'Yes. Deleted pages stay greyed out in the grid until you save, and you can restore them, or press Reset to start over.'],
      ['Are my files uploaded?', 'No. Thumbnails and the saved PDF are produced entirely on your device.']
    ]
  },
  {
    slug: 'redact-pdf',
    nav: 'Redact PDF',
    group: 'PDF',
    title: 'Redact PDF – True Redaction, Free, No Upload | Fileward',
    description: 'Permanently black out text and images in a PDF. Redacted pages are flattened to images so the hidden text is really gone. Runs in your browser, no upload.',
    h1: 'Redact a PDF (for real)',
    lead: 'Draw boxes over anything sensitive, or search for words to black out. The text under the boxes is permanently removed.',
    card: 'Black out sensitive text so it is really gone, not just covered.',
    related: ['organize-pdf', 'split-pdf', 'remove-photo-metadata'],
    help: [
      'Drop a PDF, then drag on a page to draw a black box, or type a word or number into "Find and redact" to box every match. Remove a box with its × button. When you are done, press "Redact and download".',
      'Many tools "redact" by drawing a black rectangle on top of live text. The text is still in the file and can be copied out from under the box. Fileward instead re-draws each redacted page as an image with the boxes burned in, so the original text, fonts and hidden layers on that page are gone.',
      'Because of this, redacted pages are no longer text-searchable and their links, comments and form fields are removed. Pages you did not redact are copied unchanged, unless they share hidden content with a redacted page, in which case they are flattened too.',
      'After saving, Fileward re-opens the new PDF and checks that none of the words you searched for can still be extracted, and that redacted pages contain no text layer.'
    ],
    faq: [
      ['Is this real redaction or just a black box?', 'Real redaction. Each redacted page is rasterized to an image with the boxes burned in, then rebuilt. No text is left under the boxes. We test this by extracting text from redacted output and confirming the words are gone.'],
      ['Why can I no longer select text on redacted pages?', 'Because the page is now a picture. That is what guarantees the hidden text cannot be recovered. Pages you did not redact keep their selectable text.'],
      ['Does my document get uploaded?', 'No. Rendering, redaction and verification all run in your browser. Sensitive documents are exactly why this matters.'],
      ['Is metadata removed too?', 'The new PDF is built from scratch, so the original title, author and other document properties are not copied.']
    ]
  },
  {
    slug: 'compress-image',
    nav: 'Compress image',
    group: 'Image',
    title: 'Compress JPG, PNG & WebP Images – Free, No Upload | Fileward',
    description: 'Shrink JPG, PNG and WebP photos with a quality slider and max size option. Batch compress and compare before/after sizes. Private, offline, no upload.',
    h1: 'Compress images',
    lead: 'Make JPG, PNG and WebP images smaller. Pick a quality and an optional maximum size.',
    card: 'Shrink JPG, PNG and WebP with a quality slider. Batches welcome.',
    related: ['resize-image', 'heic-to-jpg', 'remove-photo-metadata'],
    help: [
      'Drop or paste one or more images, choose a quality and, optionally, a maximum width or height, then press Compress. Each result shows the size before and after and a preview so you can judge the quality.',
      'Lower quality means smaller files. For photos, 70–80% is usually indistinguishable from the original. PNG is lossless, so the quality slider does not apply to it; convert to WebP or JPG, or reduce the dimensions, to make a PNG smaller.',
      'Compressed copies are re-encoded from pixels, so camera metadata such as GPS location is not carried over. Nothing is uploaded: the work happens in a background thread on your device.'
    ],
    faq: [
      ['What quality should I use?', 'Start at 75%. If you can see blocky artifacts, go up; if the file is still too big, lower it or set a maximum size.'],
      ['Why is my PNG not getting smaller?', 'PNG is lossless. Choose WebP or JPG as the output format, or set a maximum size.'],
      ['Are my photos uploaded?', 'No. Compression runs in your browser, and works with Wi-Fi turned off.']
    ]
  },
  {
    slug: 'resize-image',
    nav: 'Resize / convert',
    group: 'Image',
    title: 'Resize & Convert Images (JPG, PNG, WebP, AVIF) – No Upload | Fileward',
    description: 'Resize images by pixels or percent and convert between JPG, PNG, WebP and AVIF in your browser. Batch support, offline, and nothing is uploaded.',
    h1: 'Resize and convert images',
    lead: 'Change image dimensions by pixels or percent, and convert between JPG, PNG, WebP and AVIF.',
    card: 'Resize by pixels or percent and convert JPG, PNG, WebP, AVIF.',
    related: ['compress-image', 'heic-to-jpg', 'remove-photo-metadata'],
    help: [
      'Drop or paste images, pick an output format and a resize mode, then press Convert. "Percent" scales every image by the same amount; "Pixels" sets an exact width and/or height, keeping the aspect ratio if you leave the lock on.',
      'AVIF appears in the format list only when your browser can encode it. When converting a transparent image to JPG, transparent areas become white.',
      'All conversion happens on your device. Your images are never sent to a server, and the results are free of the original camera metadata.'
    ],
    faq: [
      ['Which format should I choose?', 'WebP is a good default for the web: small and widely supported. Use JPG for maximum compatibility and PNG when you need lossless quality or transparency.'],
      ['Why is AVIF missing?', 'Your browser cannot encode AVIF images. Try a recent version of Chrome.'],
      ['Are my images uploaded?', 'No. Resizing and conversion happen entirely in your browser.']
    ]
  },
  {
    slug: 'heic-to-jpg',
    nav: 'HEIC to JPG',
    group: 'Image',
    title: 'HEIC to JPG Converter – Free, No Upload, Works Offline | Fileward',
    description: 'Convert iPhone HEIC photos to JPG in batches, right in your browser. No upload, no sign-up, works offline. Download individually or as a ZIP.',
    h1: 'HEIC to JPG converter',
    lead: 'Turn iPhone HEIC photos into JPGs that open anywhere. Convert one or a whole batch.',
    card: 'Convert iPhone HEIC photos to JPG in batches.',
    related: ['compress-image', 'remove-photo-metadata', 'resize-image'],
    help: [
      'Drop your .heic or .heif photos onto the box above, choose a JPG quality and press Convert. Download each JPG, or all of them as a ZIP.',
      'iPhones save photos as HEIC by default, which many Windows apps and websites cannot open. Fileward decodes them with libheif compiled to WebAssembly, which is loaded only on this page.',
      'Photos often contain your exact location. Converted JPGs are built from pixels only, so GPS and other metadata are left behind, and the originals never leave your device.'
    ],
    faq: [
      ['Do converted photos keep my GPS location?', 'No. The JPG is created from the decoded pixels only, so EXIF data including GPS location is not copied.'],
      ['Can I convert many photos at once?', 'Yes. Drop as many as you like; they are converted one after another in a background thread and can be downloaded as a ZIP.'],
      ['Is anything uploaded?', 'No. The decoder runs in your browser. Load the page once and it works offline.'],
      ['Some photos fail to convert. Why?', 'A few HEIC variants (for example some Live Photo or burst files) are not supported by the decoder. Try exporting them as JPG from your phone instead.']
    ]
  },
  {
    slug: 'remove-photo-metadata',
    nav: 'Remove metadata',
    group: 'Image',
    title: 'Remove Photo Metadata & GPS Location (EXIF) – No Upload | Fileward',
    description: 'See the hidden EXIF data in your photos, including GPS location, camera and date, then download a clean copy with all metadata stripped. 100% in your browser.',
    h1: 'Remove photo metadata and location',
    lead: 'See what your photos reveal (camera, date and especially GPS location) and save a clean copy.',
    card: 'See hidden EXIF and GPS data and strip it from photos.',
    related: ['heic-to-jpg', 'compress-image', 'redact-pdf'],
    help: [
      'Drop or paste photos to see the metadata stored inside them. If a photo contains GPS coordinates, Fileward shows a warning with the exact location it reveals.',
      'Press "Remove metadata" to save clean copies. For JPG, PNG and WebP the metadata blocks are cut out of the file without re-compressing the image, so quality is unchanged. Only the rotation flag is kept so the photo still displays the right way up.',
      'Fileward then re-reads each clean copy to confirm that no EXIF, GPS, XMP or IPTC data remains. Your photos are never uploaded; the metadata is read and removed on your device.'
    ],
    faq: [
      ['What is EXIF data?', 'Information your camera or phone stores inside a photo: camera model, date and time, settings, and often the GPS location where it was taken.'],
      ['Does removing metadata reduce quality?', 'No. For JPG, PNG and WebP, Fileward removes the metadata blocks without touching the image data.'],
      ['Do social networks remove location data?', 'Many do, but not all, and email, chat apps and file sharing often keep it. Cleaning photos yourself is the safe option.'],
      ['Can I clean HEIC photos?', 'Fileward can show their metadata. To get a clean copy, convert them with HEIC to JPG, which never copies metadata.']
    ]
  }
];

/** Non-tool pages. */
export const HOME = {
  slug: '',
  title: 'Fileward – Private PDF & Image Tools, No Uploads, Works Offline',
  description: 'Merge, split, redact and reorder PDFs; compress, resize and convert images; HEIC to JPG; remove photo metadata. 100% in your browser, nothing is uploaded.',
  h1: 'Private file tools that never upload your files',
  lead: 'Everyday PDF and image tools that run entirely in your browser. Your files never leave your device, and every tool keeps working offline.'
};

export const PRIVACY = {
  slug: 'how-do-i-know',
  nav: 'How do I know?',
  title: 'How Do I Know My Files Are Not Uploaded? | Fileward',
  description: 'How Fileward processes files entirely in your browser, and how to verify it yourself with DevTools or by turning off Wi-Fi.',
  h1: 'How do I know my files are not uploaded?',
  lead: 'You should not have to take our word for it. Here is how Fileward works, and how to check it yourself.'
};

export const NOT_FOUND = {
  slug: '404',
  title: 'Page not found | Fileward',
  description: 'This page does not exist. Browse Fileward’s private, no-upload file tools.',
  h1: 'Page not found'
};

export const toolBySlug = (slug) => TOOLS.find((t) => t.slug === slug);

/** Absolute URL of a page by slug ('' = home). */
export function pageUrl(slug) {
  return slug ? `${SITE_URL}${slug}/` : SITE_URL;
}

/** Site-relative path of a page by slug, including the base. */
export function pagePath(slug) {
  return slug ? `${SITE.base}${slug}/` : SITE.base;
}

/** All indexable pages (for the sitemap and build inputs). */
export function allPages() {
  return [HOME, ...TOOLS, PRIVACY];
}
