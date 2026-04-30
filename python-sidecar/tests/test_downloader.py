import pytest

from stem_splitter.downloader import extract_video_id, InvalidURL


@pytest.mark.parametrize("url,vid", [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
])
def test_extract_video_id_accepts_known_forms(url, vid):
    assert extract_video_id(url) == vid


@pytest.mark.parametrize("url", [
    "https://example.com/video",
    "not a url",
    "https://youtube.com/playlist?list=abc",
])
def test_extract_video_id_rejects(url):
    with pytest.raises(InvalidURL):
        extract_video_id(url)
