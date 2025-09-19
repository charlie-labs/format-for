# HTML allowlist behavior

Allowed underline: <u>ok</u>, uppercase <U>OK</U>, and self-closing <br/> break.

Slack special inside raw HTML should be stripped in Linear:

<!here>

Mixed allowed tag with Slack special in the same raw HTML should be stripped in Linear: <u>ok</u><!here>

HTML comment should be stripped in Linear:

<!-- comment -->

Doctype should be stripped in Linear:

<!DOCTYPE html>

Trailing text after stripped HTML should remain.
