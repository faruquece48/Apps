# KidsFlix

A dark, portrait-first video app for kids with Home, Image, Videos, Reels, Favourite and Login pages.

## Add videos and images

Edit `videos.json`. Videos and reels each use one link line, where `{n}` is the file number.

```json
{
  "driveApiKey": "",
  "videos": { "link": "https://your-r2-address/Videos/V_{n}.mp4", "count": 2 },
  "reels": { "link": "https://your-r2-address/Reels/R_{n}.mp4", "count": 15 },
  "images": [
    { "title": "Happy Elephant", "url": "images/elephant.jpg" }
  ]
}
```

To add files, upload the next numbers to R2 and raise `count`. Numbers must start at 1 with no gaps.

Optional settings inside `videos` or `reels`:

- `"categories": { "cartoon": [1, 2], "rhymes": [3] }` sets the filter for each file number. The names are `cartoon`, `rhymes`, `stories` and `learning`. Files without one appear only under **All**.
- `"thumb": "thumbs/V_{n}.jpg"` sets a 1280 x 720 card picture for every file. Without it, the app uses a frame from the video.

Videos and reels stay separate. Reels appear only on the Reels page, and in Favourite if saved.

`videos` can also be a list of separate entries, including Google Drive entries such as `{ "title": "My video", "link": "DRIVE_LINK" }`. Without a `driveApiKey` they open in Google's player. The key is visible to site visitors, so restrict it to the Drive API and your site's address.

## Screen rotation

Landscape is available on the Videos pages and in fullscreen playback. Other pages ask the viewer to turn the phone upright.

## Updates

The open app checks for changes every 30 seconds, when it returns to the screen, and when the internet reconnects. No update message is shown. New videos and styles apply without interrupting playback. App code updates refresh the page and continue from the same video and time, waiting until fullscreen is closed.

## Login

The Login page is a placeholder. Real accounts need a sign-in service. Favourites are stored on the device.

## Run locally

```
npx serve .
```

## Publish

Enable GitHub Pages for the `main` branch. On a phone, open the site and choose **Add to Home Screen**.
