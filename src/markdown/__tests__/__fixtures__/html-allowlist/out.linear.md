# HTML allowlist behavior

Allowed underline: <u>ok</u>, uppercase <U>OK</U>, and self-closing <br/> break.

Slack special inside raw HTML should be stripped in Linear:

Mixed allowed tag with Slack special in the same raw HTML should be stripped in Linear: <u>ok</u><!here>

HTML comment should be stripped in Linear:

Doctype should be stripped in Linear:

Trailing text after stripped HTML should remain.
