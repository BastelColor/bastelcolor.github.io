'use client';

import { useLang, useT } from '@/components/lang';
import { boothItems } from '@/content/booth';
import { profile as profileJa } from '@/content/profile';

export function ProfileRoom() {
  const lang = useLang();
  const t = useT();
  // 英語のときは、英語の文章（content/profile.ts の en）とリンクを合わせて使う
  const profile = lang === 'en' ? { ...profileJa, ...profileJa.en } : profileJa;
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
          <dt>{t('つかっているもの', 'Tools')}</dt>
          <dd>
            <ul className="profile-skills">
              {profile.skills.map((group) => (
                <li key={group.level}>
                  <span className="profile-skill-level">{group.level}</span>
                  {group.items.join(t('、', ', '))}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {profile.certifications.length > 0 && (
          <div className="profile-fact">
            <dt>{t('資格', 'Certifications')}</dt>
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
          <dt>{t('ほかの場所', 'Elsewhere')}</dt>
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
          <h3 id="profile-booth-title">
            {t(
              'BOOTH で配布・販売しているもの',
              'Free downloads and items on BOOTH',
            )}
          </h3>
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
                  <span className="profile-booth-title">
                    {t(item.title, item.titleEn ?? item.title)}
                  </span>
                  <span className="profile-booth-price">
                    {item.price === '無料' ? t('無料', 'Free') : item.price}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
