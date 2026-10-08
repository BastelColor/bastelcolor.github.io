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
    </div>
  );
}
