// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import WatchableActionMenu, { viewingActionsFor } from "./WatchableActions";
import { artworkUrl, youtubeThumbnailUrl } from "./mediaUrls";

const fallbackPalettes = [
  [
    [20, 94, 118],
    [22, 54, 92],
  ],
  [
    [126, 58, 46],
    [66, 31, 50],
  ],
  [
    [48, 94, 72],
    [31, 55, 68],
  ],
  [
    [89, 62, 130],
    [38, 63, 91],
  ],
  [
    [116, 79, 31],
    [48, 54, 75],
  ],
  [
    [37, 104, 104],
    [62, 46, 88],
  ],
];
const rgb = (values) => values.join(",");
const colorDistance = (a, b) =>
  Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
function fallbackPalette(item) {
  let hash = 0;
  for (const character of `${item.id || ""}${item.title || ""}`)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackPalettes[hash % fallbackPalettes.length];
}
function extractPalette(image) {
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  canvas.width = 24;
  canvas.height = 36;
  context.drawImage(image, 0, 0, 24, 36);
  const pixels = context.getImageData(0, 0, 24, 36).data,
    buckets = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 180) continue;
    const values = [pixels[index], pixels[index + 1], pixels[index + 2]],
      luma = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    if (luma < 18 || luma > 238) continue;
    const bucket = values.map((value) =>
        Math.min(255, Math.round(value / 32) * 32),
      ),
      key = bucket.join(",");
    buckets.set(key, {
      values: bucket,
      count: (buckets.get(key)?.count || 0) + 1,
    });
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  if (!ranked.length) throw new Error("No usable colors");
  const first = ranked[0].values,
    second = (
      ranked.find((entry) => colorDistance(first, entry.values) > 85) ||
      ranked[1] ||
      ranked[0]
    ).values;
  return [first, second];
}
function useArtworkPalette(item) {
  const fallback = useMemo(() => fallbackPalette(item), [item.id, item.title]),
    [palette, setPalette] = useState(fallback);
  useEffect(() => {
    setPalette(fallback);
    if (!item.posterUrl) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try {
        setPalette(extractPalette(image));
      } catch {
        setPalette(fallback);
      }
    };
    image.onerror = () => active && setPalette(fallback);
    image.src = artworkUrl(item.posterUrl);
    return () => {
      active = false;
    };
  }, [item.posterUrl, fallback]);
  return palette;
}

function WatchablePoster({ item, large = false, palette }) {
  const style = {
    "--poster-a": `rgb(${rgb(palette[0])})`,
    "--poster-b": `rgb(${rgb(palette[1])})`,
  };
  if (item.posterUrl)
    return (
      <img
        className={`detailPoster ${large ? "large" : ""}`}
        src={artworkUrl(item.posterUrl)}
        alt={`${item.title} poster`}
      />
    );
  if (item.poster === true)
    return (
      <div
        className={`detailPoster posterArt ${large ? "large" : ""}`}
        style={style}
        aria-label={`${item.title} poster mockup`}
      >
        <span>WT</span>
        <b>{item.title}</b>
        <small>{item.series}</small>
      </div>
    );
  return null;
}

function identity(item) {
  return item.type === "Episode" && item.season != null && item.episode != null
    ? `${item.series} · S${String(item.season).padStart(2, "0")}:E${String(item.episode).padStart(2, "0")}`
    : item.series;
}
function formatRuntime(minutes) {
  if (!Number.isFinite(minutes)) return "Runtime unknown";
  const hours = Math.floor(minutes / 60),
    remaining = minutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining} min`;
}
function detailFields(item) {
  return {
    description:
      item.description ||
      item.why ||
      "No description is supplied by this Canon Pack release.",
    cast: item.cast || [],
    genres: item.genres || [],
    studio: item.studio || null,
    contentRating: item.contentRating || null,
    sources: item.sources || [],
  };
}
function peopleFor(item, data) {
  const cast = data.cast.map((person, index) =>
    typeof person === "string"
      ? { name: person, role: index === 0 ? "Lead cast" : "Cast" }
      : person,
  );
  const crew = [
    ...(item.crew || []),
    ...(item.director ? [{ name: item.director, role: "Director" }] : []),
    ...(data.studio ? [{ name: data.studio, role: "Studio" }] : []),
  ];
  return [...cast, ...crew].filter(
    (person, index, array) =>
      person?.name &&
      array.findIndex((candidate) => candidate.name === person.name) === index,
  );
}
function reviewsFor(item) {
  return item.communityReviews || [];
}
function initials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function NotImplemented({ children = "Not Implemented" }) {
  return (
    <span className="notImplementedBadge" aria-label="Not Implemented">
      {children}
    </span>
  );
}

function ActionButton({
  item,
  targetId,
  onTarget,
  onAction,
  onOpenDetails,
  label = "Actions ▾",
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false),
      escape = (event) => {
        if (event.key === "Escape") close();
      };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="detailActions">
      <button
        className="primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {label}
      </button>
      {open && (
        <WatchableActionMenu
          variant="inline"
          item={item}
          targetId={targetId}
          onTarget={onTarget}
          onViewingAction={onAction}
          onInspect={onOpenDetails}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function Feedback({ item, notify, id }) {
  if (item.state !== "Watched")
    return (
      <section id={id} className="detailSection feedbackLocked">
        <h3>Your rating & review</h3>
        <p>
          Personal feedback becomes available after this watchable is marked
          watched.
        </p>
      </section>
    );
  return (
    <section id={id} className="detailSection">
      <h3>Your rating & review</h3>
      <div className="rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            aria-label={`Rate ${n * 2} out of 10`}
            onClick={() => notify(`Rated ${n * 2}/10`)}
          >
            ★
          </button>
        ))}
      </div>
      <div className="feedbackChecks">
        <label className="check">
          <input type="checkbox" /> Favorite
        </label>
        <label className="check">
          <input type="checkbox" /> Would rewatch
        </label>
      </div>
      <textarea className="feedbackNotes" placeholder="Private notes…" />
      <button onClick={() => notify("Feedback saved in mockup")}>
        Save feedback
      </button>
    </section>
  );
}

function TrailerPlayer({ item, cinematic = false }) {
  const videos = (item.trailers || []).filter(
    (video) =>
      video.site === "YouTube" && /^[A-Za-z0-9_-]{11}$/.test(video.key),
  );
  const [selected, setSelected] = useState(0),
    [playing, setPlaying] = useState(false),
    railRef = useRef(null);
  useEffect(() => {
    setSelected(0);
    setPlaying(false);
  }, [item.id]);
  useEffect(() => {
    railRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selected]);
  const video = videos[selected] || videos[0];
  if (!video)
    return (
      <div className={`previewFrame ${cinematic ? "cinematicPreview" : ""}`}>
        <span>▶</span>
        <small>
          <NotImplemented /> Preview video provider unavailable
        </small>
      </div>
    );
  const select = (index) => {
      setSelected((index + videos.length) % videos.length);
      setPlaying(false);
    },
    youtubeUrl = `https://www.youtube.com/watch?v=${video.key}`,
    embedUrl = `https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1&rel=0&modestbranding=1&playsinline=1`,
    thumbnailStyle = (key) => ({
      backgroundImage: `linear-gradient(rgba(4,9,14,.18),rgba(4,9,14,.72)),url("${youtubeThumbnailUrl(key)}")`,
    }),
    providerCounts = Object.entries(item.trailerSourceCounts || {}),
    providerLabels = {
      plex: "Plex",
      justwatch: "JustWatch",
      tmdb: "TMDB",
      imdb: "IMDb",
    };
  return (
    <div className="trailerPlayer">
      <div className="trailerPlayerMeta">
        <span>
          <b>{videos.length}</b> verified video{videos.length === 1 ? "" : "s"}
        </span>
        <span>
          Quality <b>Auto</b> · fullscreen uses available source resolution
        </span>
      </div>
      <div
        className={`previewFrame ${cinematic ? "cinematicPreview" : ""} trailerFrame`}
        style={thumbnailStyle(video.key)}
      >
        {playing ? (
          <iframe
            src={embedUrl}
            title={`${item.title} — ${video.name}`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            className="trailerLaunch"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${video.name} for ${item.title}`}
          >
            <span>▶</span>
            <b>{video.name}</b>
            <small>
              {video.videoType || "Trailer"} · {video.duration} · {video.source}
            </small>
          </button>
        )}
      </div>
      <div className="trailerControls">
        <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">
          Open on YouTube ↗
        </a>
      </div>
      {videos.length > 1 && (
        <div className="trailerCarousel" aria-label="Trailer video carousel">
          <button
            className="trailerArrow"
            aria-label="Previous video"
            onClick={() => select(selected - 1)}
          >
            ‹
          </button>
          <div className="trailerRail" ref={railRef}>
            {videos.map((candidate, index) => (
              <button
                key={candidate.key}
                className={`trailerCard ${index === selected ? "active" : ""}`}
                aria-pressed={index === selected}
                onClick={() => select(index)}
                style={thumbnailStyle(candidate.key)}
              >
                <span className="trailerCardPlay">▶</span>
                <span>
                  <b>{candidate.name}</b>
                  <small>
                    {candidate.videoType || "Trailer"} · {candidate.duration}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button
            className="trailerArrow"
            aria-label="Next video"
            onClick={() => select(selected + 1)}
          >
            ›
          </button>
        </div>
      )}
      {providerCounts.length > 0 && (
        <p className="trailerProviderCounts">
          <span>
            Provider-reported listings:{" "}
            {providerCounts
              .map(
                ([provider, count]) =>
                  `${providerLabels[provider] || provider} ${count}`,
              )
              .join(" · ")}
          </span>
          <small>
            Listings may overlap; the carousel contains verified, deduplicated
            videos.
          </small>
        </p>
      )}
    </div>
  );
}

function SidecarDetail({
  item,
  targetId,
  onTarget,
  onAction,
  onOpenDetails,
  notify,
  palette,
}) {
  const data = detailFields(item);
  return (
    <div className="watchableDetailContent">
      <div className="detailHero">
        <WatchablePoster item={item} palette={palette} />
        <div className="detailHeroCopy">
          <span className="eyebrow">
            {item.type} · {identity(item)}
          </span>
          <h1>{item.title}</h1>
          <div className="chips">
            <span>{item.release || "Release unknown"}</span>
            <span>{formatRuntime(item.runtime)}</span>
            {data.contentRating && <span>{data.contentRating}</span>}
            <span
              className={"state " + item.state.toLowerCase().replace(" ", "-")}
            >
              {item.state}
            </span>
          </div>
          <p className="detailDescription">{data.description}</p>
          <ActionButton
            item={item}
            targetId={targetId}
            onTarget={onTarget}
            onAction={onAction}
            onOpenDetails={onOpenDetails}
          />
        </div>
      </div>
      <section className="detailSection">
        <h3>Details</h3>
        <div className="detailMetadata">
          <div>
            <small>Series</small>
            <b>{identity(item)}</b>
          </div>
          <div>
            <small>Genres</small>
            <b>{data.genres.join(" · ")}</b>
          </div>
          <div>
            <small>Studio</small>
            <b>{data.studio || "Unavailable"}</b>
          </div>
          <div>
            <small>Pack order</small>
            <b>#{item.order}</b>
          </div>
        </div>
      </section>
      <section className="detailSection">
        <h3>Cast</h3>
        <div className="castList">
          {data.cast.map((person) => (
            <span key={typeof person === "string" ? person : person.name}>
              {typeof person === "string" ? person : person.name}
            </span>
          ))}
        </div>
      </section>
      <section className="detailSection">
        <div className="sectionHeading">
          <h3>Preview</h3>
        </div>
        <TrailerPlayer item={item} />
      </section>
      <section className="detailSection">
        <h3>Watch sources</h3>
        <SourceList sources={data.sources} notify={notify} />
      </section>
      <Feedback item={item} notify={notify} />
      <section className="detailSection">
        <h3>Provenance</h3>
        <p className="muted">
          Relationship, metadata, and release claims trace to fictional Lantern
          Vale Canon Pack sources.
        </p>
      </section>
    </div>
  );
}

function safeSourceUrl(value, source = {}) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin),
      blocked = [...url.searchParams.keys()].some((key) =>
        /token|auth|credential|secret/i.test(key),
      ),
      isPlex =
        source.provider === "plex" || source.name?.toLowerCase() === "plex",
      allowedPlexHosts = ["app.plex.tv", source.serverHost, source.allowedHost]
        .filter(Boolean)
        .map((host) => host.toLowerCase());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      blocked ||
      (isPlex && !allowedPlexHosts.includes(url.hostname.toLowerCase()))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function openSourceDetails(source, notify) {
  const url = safeSourceUrl(source.detailsUrl, source);
  if (!url) {
    notify(`${source.name} item mapping is required`);
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) notify(`Allow popups to open ${source.name}`);
}
function SourceList({ sources, notify }) {
  if (!sources?.length)
    return (
      <div className="sourceList">
        <NotImplemented />
        <small>
          Watch-provider links are not available for this watchable.
        </small>
      </div>
    );
  return (
    <div className="sourceList">
      {sources.map((source) => {
        const isPlex =
            source.provider === "plex" || source.name.toLowerCase() === "plex",
          detailsUrl = safeSourceUrl(source.detailsUrl, source),
          requiresLink = isPlex || source.canWatch === false,
          label =
            source.openLabel || (isPlex ? "Open in Plex" : "Open in source");
        return (
          <div key={source.name}>
            <div>
              <b>{source.name}</b>
              <small>{source.quality || "Available"}</small>
            </div>
            <div>
              {!isPlex && source.canWatch !== false && !source.unavailable && (
                <button
                  className="primary"
                  onClick={() => notify(`Watch on ${source.name}`)}
                >
                  Watch
                </button>
              )}
              <button
                className={`${isPlex ? "plexOpenButton " : ""}${source.provider || ""}`}
                disabled={source.unavailable || (requiresLink && !detailsUrl)}
                title={
                  isPlex && !detailsUrl
                    ? "Map this watchable to a Plex library item first"
                    : undefined
                }
                onClick={() => openSourceDetails(source, notify)}
              >
                {source.unavailable ? <NotImplemented /> : label}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function PersonCard({ person, index, palette }) {
  return (
    <article className="personCard">
      <div
        className="personPortrait"
        style={{ "--portrait-a": `rgb(${rgb(palette[index % 2])})` }}
      >
        {person.imageUrl ? (
          <img src={artworkUrl(person.imageUrl)} alt="" />
        ) : (
          <span>{initials(person.name)}</span>
        )}
      </div>
      <b>{person.name}</b>
      <small>{person.role || "Cast & crew"}</small>
    </article>
  );
}
function ReviewCard({ review }) {
  return (
    <article className="communityReview">
      <header>
        <div className="reviewAvatar">{initials(review.author)}</div>
        <div>
          <b>{review.author}</b>
          <small>{review.date}</small>
        </div>
      </header>
      <div className="reviewStars" aria-label={`${review.rating} out of 10`}>
        {"★".repeat(Math.round(review.rating / 2))}
        <span>{"☆".repeat(5 - Math.round(review.rating / 2))}</span>
        <b>{review.rating}/10</b>
      </div>
      <p>{review.text}</p>
      {review.providerUrl && (
        <a
          className="reviewSourceLink"
          href={review.providerUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read on TMDB ↗
        </a>
      )}
    </article>
  );
}

function CinematicDetail({
  item,
  targetId,
  onTarget,
  onAction,
  notify,
  palette,
}) {
  const data = detailFields(item),
    people = peopleFor(item, data),
    reviews = reviewsFor(item),
    primary = viewingActionsFor(item)[0],
    year = item.release?.slice(0, 4) || "Year unknown",
    hasPoster = Boolean(item.posterUrl || item.poster),
    provider = item.enrichmentProvider,
    availabilityProvider = item.availabilityProvider;
  const feedbackId = `cinematic-feedback-${item.id}`;
  return (
    <div className="cinematicDetail">
      <section className={`cinematicHero ${hasPoster ? "" : "noPoster"}`}>
        <WatchablePoster item={item} large palette={palette} />
        <div className="cinematicHeroCopy">
          <span className="eyebrow">
            {item.type} · {identity(item)}
          </span>
          <h1>{item.title}</h1>
          {data.studio && <p className="cinematicByline">{data.studio}</p>}
          <div className="cinematicFacts">
            <span>{year}</span>
            <span>{formatRuntime(item.runtime)}</span>
            {data.contentRating && <span>{data.contentRating}</span>}
            <span
              className={"state " + item.state.toLowerCase().replace(" ", "-")}
            >
              {item.state}
            </span>
          </div>
          <div className="cinematicGenres">
            {data.genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
          <div className="cinematicRatings">
            <span className="ratingMetric">
              <b>★ {item.rating ? `${item.rating}/10` : "—"}</b>
              <small>Your rating</small>
            </span>
            <span className="ratingMetric">
              <b>
                {provider
                  ? `${provider.displayName} reviews`
                  : "Community reviews"}
              </b>
              <small>
                {provider ? (
                  `${item.communityReviewCount || reviews.length} public reviews`
                ) : (
                  <NotImplemented>Provider not configured</NotImplemented>
                )}
              </small>
            </span>
            <button
              onClick={() =>
                document
                  .getElementById(feedbackId)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              ☆ Rate & review
            </button>
          </div>
          <div className="cinematicActions">
            {primary && (
              <button
                className="primary cinematicPrimary"
                onClick={() => onAction(item, primary.state)}
              >
                {primary.label}
              </button>
            )}
            <ActionButton
              item={item}
              targetId={targetId}
              onTarget={onTarget}
              onAction={onAction}
            />
            <button
              className="iconAction"
              title="Mark as target"
              aria-label="Mark as target"
              disabled={item.id === targetId}
              onClick={() => onTarget(item)}
            >
              ◎
            </button>
          </div>
          <p className="cinematicSynopsis">{data.description}</p>
          <dl className="cinematicMetadata">
            <div>
              <dt>Series</dt>
              <dd>{identity(item)}</dd>
            </div>
            <div>
              <dt>First release</dt>
              <dd>{item.release || "Unknown"}</dd>
            </div>
            <div>
              <dt>Pack order</dt>
              <dd>#{item.order}</dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>Lantern Vale Canon Pack</dd>
            </div>
            {item.externalIds && (
              <div>
                <dt>External IDs</dt>
                <dd>
                  {Object.entries(item.externalIds)
                    .map(([key, value]) => `${key.toUpperCase()} ${value}`)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>
      <section className="cinematicSection">
        <div className="cinematicSectionHeading">
          <div>
            <span className="eyebrow">Optional enrichment</span>
            <h2>Cast & Crew</h2>
          </div>
          <small>
            {provider ? (
              <a
                className="providerLink"
                href={provider.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Data from {provider.displayName} ↗
              </a>
            ) : (
              <>
                <NotImplemented /> Cast provider not configured
              </>
            )}
          </small>
        </div>
        <div className="peopleRail">
          {people.length ? (
            people.map((person, index) => (
              <PersonCard
                key={`${person.name}-${person.role}`}
                person={person}
                index={index}
                palette={palette}
              />
            ))
          ) : (
            <p className="muted">
              <NotImplemented /> Cast and crew data unavailable
            </p>
          )}
        </div>
      </section>
      <section className="cinematicSection">
        <div className="cinematicSectionHeading">
          <div>
            <span className="eyebrow">Community</span>
            <h2>Ratings & Reviews</h2>
          </div>
          <small>
            {provider ? (
              <a
                className="providerLink"
                href={provider.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Reviews from {provider.displayName} ↗
              </a>
            ) : (
              <>
                <NotImplemented /> Review provider not configured
              </>
            )}
          </small>
        </div>
        <div className="reviewRail">
          {reviews.length ? (
            reviews.map((review, index) => (
              <ReviewCard key={`${review.author}-${index}`} review={review} />
            ))
          ) : (
            <p className="muted">
              <NotImplemented /> Community reviews unavailable
            </p>
          )}
        </div>
      </section>
      <section className="cinematicLowerGrid">
        <div>
          <section className="cinematicSection compact">
            <h2>Preview</h2>
            <TrailerPlayer item={item} cinematic />
          </section>
        </div>
        <div>
          <section className="cinematicSection compact">
            <h2>Ways to watch</h2>
            <SourceList sources={data.sources} notify={notify} />
            {availabilityProvider ? (
              <p className="providerAttribution">
                Streaming availability powered by{" "}
                <a
                  href={availabilityProvider.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {availabilityProvider.displayName}
                </a>
                .
              </p>
            ) : (
              <p className="providerAttribution">
                <NotImplemented /> Availability provider not configured
              </p>
            )}
          </section>
          <Feedback id={feedbackId} item={item} notify={notify} />
          <section className="detailSection">
            <h3>Data provenance</h3>
            <p className="muted">
              Canon identity, relationships, release claims, and viewing state
              remain local. Public enrichment is optional, attributed, and
              non-authoritative.
              {provider && (
                <span className="providerNotice">{provider.notice}</span>
              )}
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

export function WatchableSidecar({
  item,
  width,
  onResize,
  onClose,
  onMaximize,
  targetId,
  onTarget,
  onAction,
  notify,
}) {
  const palette = useArtworkPalette(item);
  function startResize(event) {
    event.preventDefault();
    const startX = event.clientX,
      startWidth = width,
      move = (moveEvent) =>
        onResize(
          Math.max(340, Math.min(820, startWidth + startX - moveEvent.clientX)),
        ),
      stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  return (
    <aside
      className="watchableSidecar"
      style={{ width }}
      aria-label={`Details for ${item.title}`}
    >
      <button
        className="sidecarResize"
        aria-label="Resize details panel"
        title="Drag to resize"
        onPointerDown={startResize}
      />
      <header className="sidecarHeader">
        <span className="eyebrow">Selected watchable</span>
        <div>
          <button onClick={onMaximize} title="Open full-screen details">
            ⛶ Full screen
          </button>
          <button
            className="iconButton"
            aria-label="Close details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      <div className="sidecarScroll">
        <SidecarDetail
          item={item}
          targetId={targetId}
          onTarget={onTarget}
          onAction={onAction}
          onOpenDetails={onMaximize}
          notify={notify}
          palette={palette}
        />
      </div>
    </aside>
  );
}

export function WatchableDetailModal({
  item,
  onClose,
  targetId,
  onTarget,
  onAction,
  notify,
}) {
  const palette = useArtworkPalette(item),
    style = { "--ambient-a": rgb(palette[0]), "--ambient-b": rgb(palette[1]) };
  useEffect(() => {
    const escape = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div
      className="watchableModalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="watchableDetailModal cinematicModal"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={`Full details for ${item.title}`}
      >
        <header className="detailModalHeader cinematicModalHeader">
          <span className="eyebrow">Watchable details</span>
          <button
            className="iconButton"
            aria-label="Close full-screen details"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="detailModalScroll">
          <CinematicDetail
            item={item}
            targetId={targetId}
            onTarget={onTarget}
            onAction={onAction}
            notify={notify}
            palette={palette}
          />
        </div>
      </section>
    </div>
  );
}
