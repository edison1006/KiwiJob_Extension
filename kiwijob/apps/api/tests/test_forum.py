from fastapi.testclient import TestClient

from app.main import app
from conftest import auth_headers


def test_forum_post_comment_like_flow() -> None:
    with TestClient(app) as client:
        author_headers, _ = auth_headers(client, email="forum-author@example.com")
        reader_headers, _ = auth_headers(client, email="forum-reader@example.com")

        created = client.post(
            "/forum/posts",
            headers=author_headers,
            json={
                "category": "success_story",
                "title": "What finally helped me get interviews in Auckland",
                "content": "I changed my CV to focus on measurable outcomes and started tailoring the first half page for every role.",
                "tags": ["Auckland", "CV"],
            },
        )
        assert created.status_code == 201
        post_id = created.json()["id"]
        assert created.json()["can_delete"] is True

        listing = client.get("/forum/posts?category=success_story&query=Auckland", headers=reader_headers)
        assert listing.status_code == 200
        assert [row["id"] for row in listing.json()] == [post_id]
        assert listing.json()[0]["can_delete"] is False

        comment = client.post(
            f"/forum/posts/{post_id}/comments",
            headers=reader_headers,
            json={"content": "Thanks for sharing. The measurable outcomes point is especially useful."},
        )
        assert comment.status_code == 201

        liked = client.post(f"/forum/posts/{post_id}/like", headers=reader_headers)
        assert liked.status_code == 200
        assert liked.json() == {"liked": True, "like_count": 1}

        detail = client.get(f"/forum/posts/{post_id}", headers=reader_headers)
        assert detail.status_code == 200
        assert detail.json()["comment_count"] == 1
        assert detail.json()["like_count"] == 1
        assert detail.json()["liked_by_me"] is True
        assert detail.json()["comments"][0]["author"]["display_name"] == "Test Candidate"

        unliked = client.post(f"/forum/posts/{post_id}/like", headers=reader_headers)
        assert unliked.json() == {"liked": False, "like_count": 0}


def test_forum_post_validation_and_ownership() -> None:
    with TestClient(app) as client:
        owner_headers, _ = auth_headers(client, email="forum-owner@example.com")
        other_headers, _ = auth_headers(client, email="forum-other@example.com")
        invalid = client.post(
            "/forum/posts",
            headers=owner_headers,
            json={"category": "unknown", "title": "Too short", "content": "short"},
        )
        assert invalid.status_code == 422

        created = client.post(
            "/forum/posts",
            headers=owner_headers,
            json={
                "category": "job_search",
                "title": "My first month of searching for work in New Zealand",
                "content": "This is a detailed account of what I tried, what did not work, and what I will change next month.",
            },
        )
        post_id = created.json()["id"]
        forbidden = client.delete(f"/forum/posts/{post_id}", headers=other_headers)
        assert forbidden.status_code == 403
        deleted = client.delete(f"/forum/posts/{post_id}", headers=owner_headers)
        assert deleted.status_code == 204


def test_forum_rich_text_is_sanitized() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client, email="forum-rich@example.com")
        created = client.post(
            "/forum/posts",
            headers=headers,
            json={
                "category": "interviews",
                "title": "Formatting a useful interview preparation checklist",
                "content": (
                    '<h2 style="color: #6d28d9">My checklist</h2>'
                    '<p><strong>Prepare examples</strong> before every interview.</p>'
                    '<script>alert("unsafe")</script>'
                    '<a href="javascript:alert(1)">bad link</a>'
                ),
            },
        )
        assert created.status_code == 201
        content = created.json()["content"]
        assert "<strong>Prepare examples</strong>" in content
        assert "script" not in content
        assert "javascript:" not in content


def test_forum_attachment_upload_bind_and_download() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client, email="forum-attachment@example.com")
        upload = client.post(
            "/forum/attachments",
            headers=headers,
            files={"file": ("evidence.png", b"\x89PNG\r\n\x1a\nsmall-image", "image/png")},
        )
        assert upload.status_code == 201
        attachment = upload.json()
        assert attachment["kind"] == "image"

        created = client.post(
            "/forum/posts",
            headers=headers,
            json={
                "category": "job_search",
                "title": "A screenshot of the application workflow I use",
                "content": "This image shows the workflow and the key steps that have helped me stay organised.",
                "attachment_ids": [attachment["id"]],
            },
        )
        assert created.status_code == 201
        assert created.json()["attachments"][0]["filename"] == "evidence.png"

        downloaded = client.get(f'/forum/attachments/{attachment["id"]}/content', headers=headers)
        assert downloaded.status_code == 200
        assert downloaded.content.startswith(b"\x89PNG")

        cannot_delete_bound = client.delete(f'/forum/attachments/{attachment["id"]}', headers=headers)
        assert cannot_delete_bound.status_code == 404


def test_forum_rejects_unsafe_attachment_type() -> None:
    with TestClient(app) as client:
        headers, _ = auth_headers(client, email="forum-unsafe-file@example.com")
        upload = client.post(
            "/forum/attachments",
            headers=headers,
            files={"file": ("page.html", b"<script>alert(1)</script>", "text/html")},
        )
        assert upload.status_code == 400
