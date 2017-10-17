# Rotonde/client

The client, or *Rotonde Core*, is the client base that only contributors need to worry about maintaining or updating. This separation allows for a simplier onboarding and updating flow, where the latest client revision will be seeded automatically, while the [user](https://github.com/Rotonde/user) source is all that any simple user need to maintain.

## Tutorial

To join and interact with the Rotonde Network, you need only **fork** any Rotonde profile displaying a version number at the bottom left of their page. 

With the [Beaker Browser](https://beakerbrowser.com), navigate to a profile and select the *dropdown* located in the top right of the browser and select **Fork this site**. Open your Library, select the newly created fork, and press `ctr + shift + del/backspace` begin. See this list for rotonde portals to follow: [https://cblgh.org/rotonde.html](https://cblgh.org/rotonde.html). 

- Write a first message maybe.
- Share your `dat:` url with people, and past theirs to follow them.
- Enjoy!

## Add to Library

To seed the client to others, and improve the general reliability of the network, navigate to the [dat:client](dat://2714774d6c464dd12d5f8533e28ffafd79eec23ab20990b5ac14de940680a6fe/) and select add to library. You can also clone this repo and host your own client. Just change the client url in the **user** repo. We'll make a better guide shortly, sorry.

```dat://2f21e3c122ef0f2555d3a99497710cd875c7b0383f998a2d37c02c042d598485/```

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

- `@` means you seed eachother.
- `~` means that they do not see you.
- `$` means that they are a service or a bot.

## Icon

To change your display icon, update the SVG file located at `media/images/icon.svg`. The icon should be a square file for it to display properly. Keep it small. If you update your svg manually, don't forget to go to Library->(Your Rotonde Site) and press Review Changes -> Publish, otherwise your changes wont be seen by anyone!

## Rich content

- `TEXT >> MEDIA_NAME.jpg`, will connect a media filename from `/media/content/MEDIA_NAME.jpg`.
