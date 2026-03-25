# Skylimit Protocol

R. Saravanan ([@sarava.net](https://bsky.app/profile/sarava.net) on Bluesky)

*The code implementing this protocol can be found primarily in these two files on Github: [skylimitStats.ts](https://github.com/mitotic/skylimit/blob/main/src/curation/skylimitStats.ts), [skylimitFilter.ts](https://github.com/mitotic/skylimit/blob/main/src/curation/skylimitFilter.ts)*

The Skylimit protocol probabilistically selects a subset of posts from your followees to display in the timeline. To do that, Skylimit saves metadata for posts over an averaging period (default: 28 days) to compute the posting statistics for each followee. You specify the average number of total posts that they wish to view per day (viewing rate), V. *This may be only parameter you need to choose for basic use of Skylimit.*

We then compute the *default* Skylimit Number S<sub>limit</sub>, which is the maximum number of posts shown per followee (on the average). Say the average number of total posts from the followees per day (posting rate) is R<sub>tot</sub>. If R<sub>tot</sub> &lt; V, then all posts can be viewed. In this case, S<sub>limit</sub> is set to R<sub>max</sub>, where R<sub>max</sub> is the daily posting rate of your most prolific followee.

Otherwise, some posts will need to be dropped. To compute the Skylimit Number S<sub>limit</sub> in this case, sort the followees by their posting rate, R<sub>user</sub>, in ascending order. The number of available daily views is V. Start from the least active followee and allocate R<sub>user</sub> views to each. Divide the remaining views by the remaining number of followees to estimate the Skylimit Number. This estimate will keep increasing for a while, because the least active followers are "below average" consumers of views. When the estimate stops increasing, that maximum value is the default Skylimit Number S<sub>limit</sub>. Every followee is allowed up to S<sub>limit</sub> posts shown per day. (This limit is enforced probabilistically, so the actual number of posts shown can vary from day to day.)

We can treat the followees differentially by assigning an *amplification factor* F<sub>user</sub> to each followee. We then compute S<sub>limit</sub> using the same method&mdash;by pretending that an F<sub>user</sub> value of 2 means that followee is effectively two followees and so on. The user-specific Skylimit Number S<sub>user</sub> is S<sub>limit</sub> times the amplification factor, F<sub>user</sub>.

For followees who post less than their S<sub>user</sub> value, the probability of showing one of their posts P<sub>user</sub> is 1, i.e., 100%. For followees who post more than their S<sub>user</sub> value, the probability of showing one of their posts P<sub>user</sub> =  S<sub>user</sub> / R<sub>user</sub>, where R<sub>user</sub> is their daily posting rate. Usually, only a fraction of a user's followees will post more than the default Skylimit Number S<sub>limit</sub>. If you wish to see more of a followee's posts, you can increase their amplification factor. Of course, increasing the amplification of prolific posters will decrease the the default Skylimit Number S<sub>limit</sub> because the overall number of views V is fixed.



## Post prioritization

If the show probability P<sub>user</sub> is less than 100%, then posts can be prioritized so that "more important" posts are displayed first. 

1. **Priority posts**: Original/quote posts with specific text patterns are marked as priority. By default, any hashtag present in a post makes it priority post, i.e., matching pattern `#*`, for all followees. This can be overridden in two ways: the followee can specify in their profile which of their posts should be considered priority, or you can specify the priority text patterns yourself using the UI in the followee's profile page. For example, the pattern `myblog.substack.com` would flag any posts referencing the followee's blog as a priority post.

2. **Regular posts**: All other original/quote posts, reposts, followed replies, and unfollowed replies.

 If the number of daily prioritized posts Q<sub>user</sub> &lt; S<sub>user</sub>, all priority posts are shown and the remaining shows are allocated to regular posts with probability (S<sub>user</sub> - Q<sub>user</sub>) / (R<sub>user</sub> - Q<sub>user</sub>). If Q<sub>user</sub> &ge; S<sub>user</sub>, only priority posts are shown with probability S<sub>user</sub> / Q<sub>user</sub>.

*Special case*: An original/quote post with hashtag `#weekly` is *always* shown. This provides a way for even the post prolific followee to ensure that post is always shown. (Only one post of this type per week gets this special treatment; additional posts with that hashtage during the same week will be treated normally.)

## Reply handling

Replies are categorized into two types: replies to followed accounts and replies to non-followed accounts. During the initial lookback period (first curation round), all unfollowed replies are dropped. After that:

- If the "Hide replies to non-followees" setting is enabled, all unfollowed replies are dropped.
- If the setting is disabled, unfollowed replies are shown only from "quiet posters"&mdash;followees whose regular show probability is 100% (i.e., all their regular posts are already shown).


## Repost deduplication

A configurable repost display interval (default: 24 hours, range: 0&ndash;96 hours) prevents seeing the same content multiple times. If the original post or another repost of the same post was displayed within this interval, the repost is dropped. Setting the interval to 0 disables this feature. Reposts are counted as part of a followee's posting rate only if they are shown. If the repost is dropped, it is not counted.

## Post display consistency

A  curation protocol should be consistent, i.e., it should select the same subset of posts to display regardless of which device is used. This is easy to implement in server-based feeds where probabilistic curation is applied in one place. But Skylimit is a serverless feed implementation. Each device that runs Skylimit will implement the probabilistic curation independently.
To achieve consistency, Skylimit uses the HMAC-SHA256 algorithm to generate a deterministic random number from each post's unique identifier (its AT Protocol URI for original posts, or the repost URI for reposts) combined with a configurable secret key and viewer's handle. The HMAC value is used as a random nimber to determine whether a particular post should be shown. Using the same secret key across devices ensures that the same subset of posts will be selected for display.

The above algorithm will not achive perfect consistency across devices, but if the user uses each of their devices at least once a day, the same set of posts will be used to compute the show probabilities and near consistency can be achieved.

(*Cryptographic tidbit*: A followee who knows the secret key can potentially game this algorithm by tweaking the post content to ensure all that their posts are always shown to a particular user, but this will only work to target a single user!)

## Periodic editions

Posts from configured accounts can be collected during curation intervals and displayed at scheduled times as digest "editions" (e.g., a Morning Edition at 08:00 and an Afternoon Edition at 15:00). An edition layout specifies which accounts appear in which sections.


## Interval-based statistics

Skylimit uses interval-based analysis for statistics. Posts are grouped into configurable time intervals (default: 2 hours; valid values: 1, 2, 3, 4, 6, 8, 12 hours&mdash;all factors of 24). The "complete intervals" algorithm determines which intervals have reliable data:

An interval is considered *complete* if it has a non-zero post count and both of its chronological neighbors also have non-zero counts. Boundary intervals (the first and last in the range) are always treated as incomplete. Statistics are derived primarily from complete intervals, which improves accuracy by excluding periods where data collection may have been interrupted (e.g., when the user was not actively browsing).

For each followee, an effective day count is computed based on when they were first observed posting, using a partial interval amplification factor to account for incomplete data. A configurable minimum followee day count (default: 1) prevents inflated posting rates for recently followed accounts.
