# Skylimit: A Curating Web Client for Bluesky

- [Trying out Skylimit](#trying-out-skylimit)
- [Why "Skylimit"?](#why-skylimit)
- [Caveat](#caveat)
- [Authors](#authors)
- [Running it yourself](#running-it-yourself)
- [Documentation](#documentation)

Skylimit is an installable web application that implements a client-side [curation protocol](docs/SkylimitProtocol.md) for the [Bluesky](https://bsky.app/) microblogging network. It provides fine-grained control on how you consume your Bluesky Following Feed.

The goal of many social media platforms is to maximize your screen time. Skylimit takes a different approach: the goal is to *limit*, not maximize, your social media interaction time. The Skylimit algorithm tries to statistically optimize your social interaction within a specified limit. It attempts to answer the following question: *If I decide to limit myself to viewing, say, 500 posts per day (on average), what is the best way to manage my Following Feed?*

This is similar to the decisions editors make when populating a fixed number of pages in a printed newspaper&mdash;they must choose from news items on numerous topics, regular pieces by columnists, etc. Skylimit aims to mimic aspects of the print newspaper reading experience in the digital world by creating a curated version of the Following Feed with statistical settings for each followee that go beyond just muting.

When you use Skylimit, you start by specifying how many posts you wish to view per day *on average*. On some days you'll view more and on some days less, depending upon how active your followees are each day. Statistics of your feed activity, computed over a period (usually 30 days), are used to enforce this "soft" limit.

A basic premise of Skylimit is that if you follow someone, you wish to see at least some of the content they post. We'd like to listen to different voices in the media, but commercial algorithms may promote a louder voice more than a softer voice. Posts by "less popular" users may never be seen even by people who follow them. This often discourages such users from posting at all.

By default, Skylimit will guarantee each of your followees a certain number of views (or impressions) per day, known as the *Skylimit Number*. The default Skylimit Number will be typically larger than the number of desired daily views divided by the number of followees, because not all your followees will post that frequently. Say you follow 150 people and wish to view 300 posts per day, the default Skylimit Number may be 7, rather than 2. (See the [protocol description](docs/SkylimitProtocol.md) for more detail.)

Relying on your natural (rather than artificial) intelligence, Skylimit allows you to easily *amp up* (or *amp down*) the Skylimit Number of any followee, to allow more or fewer views per day. You can use this feature to ensure that you always see someone's posts. You can also use it to reduce views of those who post interesting stuff, but too much of it every day. Typically, you will need to adjust the Skylimit number only for a fraction of your followees to take control of your feed. Doing that can free up view time that you can use to follow more people and explore different content.

<p align="center">
<img src="docs/images/SettingsCuration.png"
     alt="Skylimit curation settings page">
<br>
<em>Skylimit curation settings page</em>
</p>


## Trying out Skylimit

You can try out Skylimit at [https://skylimit.dev](https://skylimit.dev) using a web browser.

To use Skylimit, simply log in using a Bluesky [app password](https://bsky.app/settings/app-passwords) and start browsing. You can go to the *Settings > Curation* tab to see the configuration options. The most important setting is *Average views per day*, which statistically limits your viewing. (The [Skylimit User Guide](docs/UserGuide.md) provides more detailed information on all the settings.)

<p align="center">
<img src="docs/images/HomeTimeline.png"
     alt="Skylimit home timeline with curated feed">
<br>
<em>Skylimit home timeline showing the curated Following Feed</em>
</p>

When you start using Skylimit, it will begin to analyze your feed and compute the statistics on the posting behavior of your followees. Initially, Skylimit usually has about a day's worth of data to analyze but it will slowly accumulate data as you continue to use it. All the statistical data is stored in your browser, not on any server, ensuring privacy. If you use Skylimit from a different browser, it will compute the statistics separately there.

The posting statistics for all your followees are displayed in the *Settings > Following* tab, sorted in descending order of posts per day. You can *amp up* (or *amp down*) a followee by clicking on the show probability value to open a popup. See the [User Guide](docs/UserGuide.md) for more information.


## Why "Skylimit"?

The name is a combination of Sky (from Bluesky) and Limit (from the curation limiting concept). The Skylimit algorithm is derived from the [Mahoot](https://github.com/mitotic/pinafore-mahoot) algorithm, a similar curation protocol for Mastodon implemented within the Pinafore web client.


## Caveat

Skylimit is beta-quality software that is being actively developed and may occasionally break. However, it is unlikely to damage your Bluesky account because Skylimit is a standalone web client that stores all its curation data in the web browser (no curation data is sent to the Bluesky server). You can continue to access Bluesky using any other web client or phone app with no interference from Skylimit.


## Authors

[R. Saravanan](https://github.com/mitotic) ([@sarava.net](https://bsky.app/profile/sarava.net) on Bluesky), with assistance from AI coding tools (Cursor AI and Claude Code).


## Running it yourself

Instead of using the [skylimit.dev](https://skylimit.dev) website, you can also download the Skylimit [source code](https://github.com/mitotic/skylimit) and run it on your desktop or laptop computer. You will need [Node.js](https://nodejs.org/) 18+ installed.

```bash
git clone https://github.com/mitotic/skylimit
cd skylimit
npm install
npm run dev
```

The dev server will start at http://localhost:5181 (as configured in `vite.config.ts`).

To build for production:

```bash
npm run build
```

The build output will be in the `dist/` directory, ready for deployment to any static hosting provider. See the [Admin Guide](docs/AdminGuide.md) for deployment instructions and test server setup.


## Documentation

- [User Guide](docs/UserGuide.md) &mdash; Complete guide to Skylimit features and curation settings
- [Skylimit Protocol](docs/SkylimitProtocol.md) &mdash; Technical specification of the curation algorithm
- [Architecture](docs/Architecture.md) &mdash; Developer guide to the codebase
- [Admin Guide](docs/AdminGuide.md) &mdash; Deployment and test server setup
