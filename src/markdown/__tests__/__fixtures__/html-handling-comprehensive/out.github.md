# HTML handling: mixed cases

Inline: <blink>foo & bar</blink> <u>u</u> and <sub>2</sub>/<sup>n</sup> with <br>line break.

<div>
Block with <u>u</u> and <blink>bad</blink><br>next line
</div>

Comments: <!-- keep me -->ok.

Attributes: <u class="a" style="color:red">styled</u> and <sup id="x">x</sup> and <a href="https://ex.com" data-x="1">click</a>.

Disallowed dangerous: <script>alert('x')</script> mid and <style>i{}</style>end.

<details>
<summary>More</summary>

Line 1 <u>u</u>

</details>
