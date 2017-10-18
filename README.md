# Rotonde/client

**Rotonde** is a decentralized social network based on an equally *decentralized* application. The two parts of the application are as follows:

- The [client](https://github.com/Rotonde/rotonde-client), the core of the application.
- The [portal](https://github.com/Rotonde/rotonde-portal), the user files, settings and customization.

The client, or *Rotonde Core*, is what contributors need to make improvements on the inner systems of the application. This separation allows for a simpler onboarding and updating flow, where the latest client revision will be seeded automatically (read-only), while the [portal](https://github.com/Rotonde/rotonde-portal) source is all that any simple user needs to maintain.

## Setup

### For a new user

- Open @neauoire's portal in Beaker
    - dat://2f21e3c122ef0f2555d3a99497710cd875c7b0383f998a2d37c02c042d598485/
- Select "Fork this site" and open it in your Library.
- Select the input field and press `ctrl shift del/backspace`.
- Share your user site hash with people, and paste theirs to follow them.
- **EXTRA** If you already have an instance of the previous version of Rotonde, copy/paste your portal.json and move it into your site root.
- Enjoy!

### For developers

That goal of this tutorial is to have both a local client and portal.

- Clone both repositories in your `~/Sites`
- Create two sites using the [Beaker Browser](https://beakerbrowser.com) and point them to the user/client repositories.
- Update the `portal/index.html` file with your client site hash, found in the Beaker address bar or the *Share* button.
- Update the `client/dat.json` with the client site hash, and the `portal/dat.json` with the portal hash.
- Enjoy!

## Commands

- `dat://000` will follow a portal.
- `undat://000` will unfollow a portal.
- `filter @neauoire` will show your mentions.
- `clear_filter` will clear the filtered feed.
- `edit:name Some_name` will change your display name.
- `edit:desc Some_name` will change your display description.
- `edit:site Some_name` will change your display site.
- `edit:0` will edit your first entry.
- `delete:0` will delete your first entry.

## Runes

- `@` means you seed each other.
- `~` means that they do not see you mention them.
- `$` means that they are a service or a bot.

## Icon

To change your display icon, update the SVG file located at `media/content/icon.svg`. The icon should be a square file for it to display properly. Keep it small. If you update your SVG manually, don't forget to go to *Library -> (Your Rotonde Site)* and press *Review Changes -> Publish*, otherwise your changes wont be seen by anyone!

## Rich content

- `TEXT >> MEDIA_NAME.jpg`, will connect a media filename from `media/content/MEDIA_NAME.jpg`.
