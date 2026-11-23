# Swipe Videos

A full-screen video app. Swipe left or up for the next video, and right or down for the previous one.

## Add videos

1. In Google Drive, set each video to **Anyone with the link: Viewer**.
2. Add its link to `videos.json`:

```json
{
  "driveApiKey": "",
  "videos": [
    { "title": "My first video", "link": "https://drive.google.com/file/d/FILE_ID/view?usp=sharing" }
  ]
}
```

## Optional: smoother playback

Without an API key, videos use Google's Drive player. Tap once to use its controls for 5 seconds, and swiping resumes afterwards.

With a Google Drive API key in `driveApiKey`, videos play in the app's own player with autoplay and tap to pause. The key is visible to site visitors, so restrict it to the Drive API and your site's address in Google Cloud Console.

## Run locally

```
npx serve .
```

## Publish

Enable GitHub Pages for the `main` branch. On a phone, open the site and choose **Add to Home Screen**.
