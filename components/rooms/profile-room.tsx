import { boothItems } from '@/content/booth';
import { profile } from '@/content/profile';

export function ProfileRoom() {
  return (
    <div className="profile">
      <p className="profile-lead">
        {profile.leadLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <p className="profile-body">{profile.body}</p>

      {/* 項目ごとに、うすい角丸の背景でまとまりを見せる */}
      <dl className="profile-facts">
        <div className="profile-fact">
          <dt>つかっているもの</dt>
          <dd>
            <ul className="profile-skills">
              {profile.skills.map((group) => (
                <li key={group.level}>
                  <span className="profile-skill-level">{group.level}</span>
                  {group.items.join('、')}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {profile.certifications.length > 0 && (
          <div className="profile-fact">
            <dt>資格</dt>
            <dd>
              <ul className="profile-certifications">
                {profile.certifications.map((certification) => (
                  <li key={certification}>{certification}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div className="profile-fact">
          <dt>ほかの場所</dt>
          <dd>
            {profile.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ))}
          </dd>
        </div>
      </dl>

      {/* BOOTH で配布・販売しているもの */}
      {boothItems.length > 0 && (
        <section
          className="profile-booth"
          aria-labelledby="profile-booth-title"
        >
          <h3 id="profile-booth-title">BOOTH で配布・販売しているもの</h3>
          <ul>
            {boothItems.map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img
                    src={item.image}
                    alt=""
                    width={300}
                    height={300}
                    loading="lazy"
                    // BOOTH の画像は、どのページから見られたかを伝えずに読む
                    referrerPolicy="no-referrer"
                  />
                  <span className="profile-booth-title">{item.title}</span>
                  <span className="profile-booth-price">{item.price}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
