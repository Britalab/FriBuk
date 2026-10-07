// Biografía y sitio web de un perfil. Solo muestra; no incluye controles de edición.
export default function ProfileAbout({ bio, websiteUrl }) {
  const safeWebsiteUrl = /^https?:\/\//i.test(websiteUrl || "") ? websiteUrl : "";

  if (!bio && !safeWebsiteUrl) return null;

  return (
    <div className="profile-about">
      {bio && <p className="profile-about-bio">{bio}</p>}
      {safeWebsiteUrl && (
        <a
          className="profile-about-link"
          href={safeWebsiteUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          <span aria-hidden="true">↗</span>
          {safeWebsiteUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
        </a>
      )}
    </div>
  );
}
