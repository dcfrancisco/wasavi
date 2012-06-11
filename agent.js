// ==UserScript==
// @include http://*/*
// @include https://*/*
// @exclude http://appsweets.net/wasavi/wasavi_frame.html
// @exclude https://ss1.xrea.com/appsweets.net/wasavi/wasavi_frame.html
// ==/UserScript==
//
/**
 * wasavi: vi clone implemented in javascript
 * =============================================================================
 *
 *
 * @author akahuku@gmail.com
 * @version $Id: agent.js 135 2012-06-11 20:45:00Z akahuku $
 */
/**
 * Copyright 2012 akahuku, akahuku@gmail.com
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

typeof WasaviExtensionWrapper != 'undefined'
&& window.location.href != WasaviExtensionWrapper.framePageUrl.external
&& window.location.href != WasaviExtensionWrapper.framePageUrl.externalSecure
&& (function (global) {

	/*const*/var EXTENSION_SPECIFIER = 'data-texteditor-extension';
	/*const*/var EXTENSION_CURRENT = 'data-texteditor-extension-current';
	/*const*/var FULLSCREEN_MARGIN = 8;
	/*const*/var ACCEPTABLE_TYPES = {
		textarea: 'enableTextArea',
		text:     'enableText',
		search:   'enableSearch',
		tel:      'enableTel',
		url:      'enableUrl',
		email:    'enableEmail',
		password: 'enablePassword',
		number:   'enableNumber'
	};

	var extension;

	var enableList;
	var exrc;
	var shortcut;
	var shortcutTester;
	var fontFamily;

	var targetElement;
	var wasaviFrame;
	var keyStroked;

	/**
	 * wasavi runner
	 * ----------------
	 */

	function locate (iframe, target, isFullscreen) {
		function isFixedPosition (element) {
			var isFixed = false;
			for (var tmp = element; tmp && tmp != document.documentElement; tmp = tmp.parentNode) {
				var s = document.defaultView.getComputedStyle(tmp, '');
				if (s && s.position == 'fixed') {
					isFixed = true;
					break;
				}
			}
			return isFixed;
		}
		if (isFullscreen) {
			var rect = {
				left:FULLSCREEN_MARGIN,
				top:FULLSCREEN_MARGIN,
				width:document.documentElement.clientWidth - FULLSCREEN_MARGIN * 2,
				height:document.documentElement.clientHeight - FULLSCREEN_MARGIN * 2
			};
			iframe.style.position = 'fixed';
			iframe.style.left = rect.left + 'px';
			iframe.style.top = rect.top + 'px';
			iframe.style.width = rect.width + 'px';
			iframe.style.height = rect.height + 'px';
		}
		else {
			var rect = target.getBoundingClientRect();
			var isFixed = isFixedPosition(target);
			iframe.style.position = isFixed ? 'fixed' : 'absolute';
			iframe.style.left = (
				rect.left + 
				(isFixed ? 0 : document.documentElement.scrollLeft)
			) + 'px';
			iframe.style.top = (
				rect.top + 
				(isFixed ? 0 : document.documentElement.scrollTop)
			) + 'px';
			iframe.style.width = rect.width + 'px';
			iframe.style.height = rect.height + 'px';
		}
		return rect;
	}

	function run (element) {
		function getFontStyle (s, fontFamilyOverride) {
			return [s.fontStyle, s.fontVariant, s.fontWeight, s.fontSize,
				'/' + s.lineHeight, (fontFamilyOverride || s.fontFamily)].join(' ');
		}

		targetElement = element;
		wasaviFrame = document.createElement('iframe');
		var rect = locate(wasaviFrame, element);
		wasaviFrame.style.border = 'none';
		wasaviFrame.style.overflow = 'hidden';
		wasaviFrame.style.visibility = 'hidden';
		wasaviFrame.style.zIndex = 0x00ffffff;

		if (WasaviExtensionWrapper.framePageUrl.internalAvailable) {
			wasaviFrame.src = WasaviExtensionWrapper.framePageUrl.internal;
		}
		else if (window.location.protocol == 'https:') {
			wasaviFrame.src = WasaviExtensionWrapper.framePageUrl.externalSecure;
		}
		else {
			wasaviFrame.src = WasaviExtensionWrapper.framePageUrl.external;
		}

		wasaviFrame.onload = function handleIframeLoaded (e) {
			var s = document.defaultView.getComputedStyle(element, '');
			var payload = {
				type:'run',
				parentTabId:extension.tabId,
				id:element.id,
				nodeName:element.nodeName,
				elementType:element.type,
				selectionStart:element.selectionStart,
				selectionEnd:element.selectionEnd,
				scrollTop:element.scrollTop,
				scrollLeft:element.scrollLeft,
				readOnly:element.readOnly,
				value:element.value,
				rect:{width:rect.width, height:rect.height},
				fontStyle:getFontStyle(s, fontFamily)
			};
			extension.postMessage({type:'notify-to-child', payload:payload});
		};

		document.body.appendChild(wasaviFrame);
	}

	function cleanup (value) {
		if (targetElement) {
			if (value !== undefined) {
				targetElement.value = value;
			}
			targetElement.removeAttribute(EXTENSION_CURRENT);
			targetElement = null;
		}
		if (wasaviFrame) {
			wasaviFrame.parentNode.removeChild(wasaviFrame);
			wasaviFrame = null;
		}
	}

	function focusToFrame () {
		if (wasaviFrame) {
			try {
				wasaviFrame.focus
				&& wasaviFrame.focus();
			} catch (e) {}
			try {
				wasaviFrame.contentWindow
				&& wasaviFrame.contentWindow.focus
				&& wasaviFrame.contentWindow.focus();
			} catch (e) {}
		}
	}

	/**
	 * keydown handler
	 * ----------------
	 */

	function handleKeydown (e) {
		if (targetElement || !e || !e.target) return;
		if (e.target.nodeName != 'TEXTAREA' && e.target.nodeName != 'INPUT') return;
		if (!(e.target.type in ACCEPTABLE_TYPES) 
		||  !enableList[ACCEPTABLE_TYPES[e.target.type]]) return;

		/*
		 * <textarea>
		 * <textarea data-texteditor-extension="auto">
		 *     one of extensions installed into browser is executed.
		 *
		 * <textarea data-texteditor-extension="none">
		 *     no extension is executed.
		 *
		 * <textarea data-texteditor-extension="wasavi">
		 *     wasavi extension is executed.
		 */

		var current = e.target.getAttribute(EXTENSION_CURRENT);
		var spec = e.target.getAttribute(EXTENSION_SPECIFIER);
		if (current !== null) return;
		if (spec !== null && spec !== 'auto' && spec !== 'wasavi') return;

	    if (shortcutTester(e)) {
			e.target.setAttribute(EXTENSION_CURRENT, 'wasavi');
			e.preventDefault();
			run(e.target);
		}
	}

	/**
	 * DOMContentLoaded on options page handler
	 * ----------------
	 */

	function handleOptionsPageLoaded () {
		for (var i in enableList) {
			var el = document.getElementById(i);
			if (el && el.nodeName == 'INPUT' && el.type == 'checkbox') {
				el.checked = enableList[i];
			}
		}

		var el = document.getElementById('exrc');
		if (el && el.nodeName == 'TEXTAREA') {
			el.value = exrc;
		}

		var el = document.getElementById('shortcut');
		if (el && el.nodeName == 'INPUT') {
			el.value = shortcut;
		}

		var el = document.getElementById('font-family');
		if (el && el.nodeName == 'INPUT') {
			el.value = fontFamily;
		}

		var el = document.getElementById('save');
		if (el) {
			el.addEventListener('click', handleOptionsSave, false);
		}
	}

	/**
	 * save button handler
	 * ----------------
	 */

	function handleOptionsSave () {
		var items = [];
		var tmpEnableList = {};
		var count = 0;

		for (var i in enableList) {
			var el = document.getElementById(i);
			if (el && el.nodeName == 'INPUT' && el.type == 'checkbox') {
				tmpEnableList[i] = el.checked;
				count++;
			}
		}
		if (count) {
			items.push({key:'targets', value:JSON.stringify(tmpEnableList)});
		}
		
		var el = document.getElementById('exrc');
		if (el && el.nodeName == 'TEXTAREA') {
			items.push({key:'exrc', value:el.value});
		}

		var el = document.getElementById('shortcut');
		if (el && el.nodeName == 'INPUT') {
			items.push({key:'shortcut', value:el.value});
		}

		var el = document.getElementById('font-family');
		if (el && el.nodeName == 'INPUT') {
			items.push({key:'font-family', value:el.value});
		}

		items.length && extension.postMessage(
			{type:'set-storage', items:items},
			function () {
				var saveResult = document.getElementById('save-result');
				if (saveResult) {
					saveResult.textContent = 'saved.';
					setTimeout(function () {
						saveResult.textContent = '';
					}, 1000 * 2);
				}
			}
		);
	}

	/**
	 * shortcut key testing function factory
	 * ----------------
	 */

	function createShortcutTester (code) {
		var result;
		try {
			result = new Function('e', code);
		}
		catch (e) {
			result = new Function('return false;');
		}
		return result;
	}

	/**
	 * agent initializer handler
	 * ----------------
	 */

	function handleAgentInitialized () {
		if (window.location.href == WasaviExtensionWrapper.optionsPageUrl) {
			handleOptionsPageLoaded();
		}
		//else {
			window.addEventListener('keydown', handleKeydown, true);
		//}

		var isTopFrame;
		try { isTopFrame = !window.frameElement; } catch (e) {} 
		isTopFrame && document.querySelectorAll('textarea').length && console.log(
			'wasavi agent: running on ' + window.location.href.replace(/[#?].*$/, ''));
	}

	/**
	 * bootstrap
	 * ----------------
	 */

	extension = WasaviExtensionWrapper.create();
	extension.setMessageListener(function (req) {
		if (!req || !req.type) return;

		switch (req.type) {
		case 'init-response':
			enableList = JSON.parse(req.targets);
			exrc = req.exrc;
			shortcut = req.shortcut;
			shortcutTester = createShortcutTester(req.shortcutCode);
			fontFamily = req.fontFamily;

			if (window.chrome) {
				WasaviExtensionWrapper.framePageUrl.internalAvailable = true;
			}
			if (document.readyState == 'interactive' || document.readyState == 'complete') {
				handleAgentInitialized();
			}
			else {
				document.addEventListener('DOMContentLoaded', function () {
					document.removeEventListener('DOMContentLoaded', arguments.callee, false);
					handleAgentInitialized()
				}, false);
			}
			break;

		case 'update-storage':
			req.items.forEach(function (item) {
				switch (item.key) {
				case 'targets':
					enableList = JSON.parse(item.value);
					break;

				case 'exrc':
					exrc = item.value;
					break;

				case 'shortcut':
					shortcut = item.value;
					break;

				case 'shortcutCode':
					shortcutTester = createShortcutTester(item.value);
					break;
				}
			});
			break;

		case 'wasavi-initialized':
			if (!wasaviFrame) break;
			wasaviFrame.style.visibility = 'visible';
			focusToFrame();
			wasaviFrame.style.height = (req.height || targetElement.offsetHeight) + 'px';
			wasaviFrame.style.boxShadow = '0 1px 8px 4px #444';
			console.info('wasavi started');

			/*
			var animationHeight = targetElement.offsetHeight;
			var goalHeight = req.height || targetElement.offsetHeight;

			(function () {
				if (!targetElement || !wasaviFrame) return;

				wasaviFrame.style.height = animationHeight + 'px';

				if (keyStroked
				|| animationHeight >= goalHeight) {
					wasaviFrame.style.height = goalHeight + 'px';
					wasaviFrame.style.boxShadow = '0 1px 8px 4px #444';
					console.info('wasavi started');
				}
				else {
					animationHeight += 2;
					setTimeout(arguments.callee, 10);
				}
			})();
			*/
			break;

		case 'wasavi-stroked':
			if (!wasaviFrame) break;
			keyStroked = true;
			break;

		case 'wasavi-window-state':
			if (!wasaviFrame) break;
			switch (req.state) {
			case 'maximized':
			case 'normal':
				var rect = locate(wasaviFrame, targetElement, req.state == 'maximized');
				extension.postMessage({type:'notify-to-child', childTabId:req.tabId, payload:{
					type:'relocate',
					rect:{width:rect.width, height:rect.height - req.modelineHeight}
				}});
				break;
			}
			break;

		case 'wasavi-focus-me':
			if (!wasaviFrame) break;
			focusToFrame();
			break;

		case 'wasavi-terminated':
			if (!wasaviFrame) break;
			cleanup(req.value);
			console.info('wasavi terminated');
			break;
		}
	});
	extension.sendRequest({type:'init-agent'});
})(this);

// vim:set ts=4 sw=4 fileencoding=UTF-8 fileformat=unix filetype=javascript :
