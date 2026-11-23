# KidsFlix

A dark, portrait-first video app for kids with Home, Image, Videos, Reels, Favourite and Login pages.

## Add videos and images

Edit `videos.json`. Only `url` is required for each entry.

```json
{
  "driveApiKey": "",
  "videos": [
    {
      "title": "Forest Friends",
      "url": "https://your-r2-address/Videos/forest.mp4",
      "category": "cartoon",
      "thumb": "thumbs/forest.jpg",
      "reel": false
    }
  ],
  "images": [
    { "title": "Happy Elephant", "url": "images/elephant.jpg" }
  ]
}
```

- `category` is one of `cartoon`, `rhymes`, `stories` or `learning`. Videos without one appear only under **All**.
- `thumb` is a 1280 x 720 picture for the video card. Without it, the app uses a frame from the video.
- `reel: true` shows a video only on the Reels page, and in Favourite if saved. If no video has it, Reels shows every video.

Google Drive links still work: use `"link"` instead of `"url"`. Without a `driveApiKey` they open in Google's player. The key is visible to site visitors, so restrict it to the Drive API and your site's address.

## Screen rotation

Landscape is available on the Videos pages and in fullscreen playback. Other pages ask the viewer to turn the phone upright.

## Login

The Login page is a placeholder. Real accounts need a sign-in service. Favourites are stored on the device.

## Run locally

```
npx serve .
```

## Publish

Enable GitHub Pages for the `main` branch. On a phone, open the site and choose **Add to Home Screen**.
