-- Real actor ids, read from the Neoito Apify account's actor list.
--
-- supreme_coder/linkedin-post takes `urls`, not keywords, so it uses the new
-- urlPattern column: one LinkedIn content-search URL per keyword. numLikes and
-- numComments stay at 0 deliberately — those options fetch the PEOPLE who liked
-- and commented, which is the one category of data this system does not hold.
PRAGMA defer_foreign_keys=ON;

ALTER TABLE "ApifyActor" ADD COLUMN "urlPattern" TEXT NOT NULL DEFAULT '';

UPDATE "ApifyActor" SET
    "actorId" = 'apidojo~tweet-scraper',
    "input" = '{
  "searchTerms": {{keywords}},
  "maxItems": {{limit}},
  "sort": "Latest",
  "tweetLanguage": "en",
  "start": "{{sinceDate}}"
}',
    "mapping" = '{
  "id": "id|url",
  "title": "text",
  "body": "text|fullText|full_text",
  "author": "author/userName|author/name|username",
  "url": "url|twitterUrl",
  "createdAt": "createdAt|created_at",
  "score": "likeCount|favoriteCount|favorite_count",
  "numComments": "replyCount|reply_count"
}',
    "channel" = 'x.com'
WHERE "projectId" = 'proj_drydock' AND "name" = 'X/Twitter — DryDock signals';

UPDATE "ApifyActor" SET
    "actorId" = 'supreme_coder~linkedin-post',
    "urlPattern" = 'https://www.linkedin.com/search/results/content/?keywords={kw}&datePosted=%22past-week%22&sortBy=%22date_posted%22',
    "input" = '{
  "urls": {{searchUrls}},
  "limitPerSource": {{limit}},
  "scrapeUntil": "{{sinceDate}}",
  "deepScrape": true,
  "numComments": 0,
  "numLikes": 0
}',
    "mapping" = '{
  "id": "urn|postUrl|url",
  "title": "text|postContent|content",
  "body": "text|postContent|content",
  "author": "authorName|author/name|author/firstName|authorHeadline",
  "url": "postUrl|url|link",
  "createdAt": "postedAtISO|postedAt|publishedAt|date",
  "score": "numLikes|likesCount|reactionsCount",
  "numComments": "numComments|commentsCount"
}',
    "channel" = 'linkedin.com'
WHERE "projectId" = 'proj_drydock' AND "name" = 'LinkedIn posts — DryDock signals';
