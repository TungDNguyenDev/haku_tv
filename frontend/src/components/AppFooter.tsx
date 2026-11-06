// TMDB's terms ask apps using their API to credit them and say the app is not endorsed by TMDB.
export default function AppFooter() {
  return (
    <footer className="px-4 pt-8 pb-12 text-xs text-muted md:px-12">
      <p>
        Dữ liệu phim và hình ảnh lấy từ{' '}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="underline hover:text-white">
          TMDB
        </a>
        . Sản phẩm này sử dụng TMDB API nhưng không được TMDB xác nhận hay chứng nhận.
      </p>
      <p className="mt-2">HakuTV · dự án học tập cá nhân, phi thương mại.</p>
    </footer>
  )
}
