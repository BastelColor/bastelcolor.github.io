/**
 * 夜の空にときどき流れる、流れ星（トップと 404）。
 * 夜の空（app/styles/sky.css の --stars が 1）のときだけ見える。動きは app/styles/sky.css
 */
export function ShootingStars() {
  return (
    <div className="shooting-stars" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
