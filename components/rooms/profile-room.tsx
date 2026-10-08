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

      <dl className="profile-facts">
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
        <dt>ほかの場所</dt>
        <dd>
          {profile.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </dd>
      </dl>
    </div>
  );
}
