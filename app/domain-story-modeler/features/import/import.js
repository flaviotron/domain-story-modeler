'use strict';

import { registerWorkObjectIcons, getWorkObjectIconDictionaryKeys, allInWorkObjectIconDictionary } from '../../language/icon/workObjectIconDictionary';
import { registerActorIcons, getActorIconDictionaryKeys, allInActorIconDictionary } from '../../language/icon/actorIconDictionary';
import { DOMAINSTORY, ACTIVITY, CONNECTION, WORKOBJECT, ACTOR } from '../../language/elementTypes';
import { checkElementReferencesAndRepair } from './ImportRepair';
import { cleanDictionaries } from '../dictionary/dictionary';
import { correctElementRegitryInit, getAllCanvasObjects, getAllGroups, initElementRegistry } from '../canvasElements/canvasElementRegistry';
import { isInDomainStoryGroup } from '../../util/TypeCheck';
import { assign } from 'min-dash';
import { storyPersistTag, saveIconConfiguration, loadConfiguration, importConfiguration } from '../iconSetCustomization/persitence';
import { removeDirtyFlag } from '../export/dirtyFlag';
import { addIMGToIconDictionary } from '../iconSetCustomization/appendIconDictionary';
import { debounce } from '../../util/helpers';
import { domExists } from '../../language/testmode';

var modal = document.getElementById('modal'),
    info = document.getElementById('info'),
    infoText = document.getElementById('infoText'),
    titleInput = document.getElementById('titleInput'),
    title = document.getElementById('title'),
    versionInfo = document.getElementById('versionInfo'),
    brokenDSTInfo = document.getElementById('brokenDSTInfo'),
    importedVersionLabel = document.getElementById('importedVersion'),
    modelerVersionLabel = document.getElementById('modelerVersion'),
    brokenDSTDialogButtonCancel = document.getElementById('brokenDSTDialogButtonCancel'),
    versionDialogButtonCancel = document.getElementById('closeVersionDialog');

if (versionDialogButtonCancel) {
  versionDialogButtonCancel.addEventListener('click', function() {
    modal.style.display = 'none';
    versionInfo.style.display = 'none';
  });

  brokenDSTDialogButtonCancel.addEventListener('click', function() {
    closeBrokenDSTDialog();
  });
}

function closeBrokenDSTDialog() {
  brokenDSTInfo.style.display = 'none';
  modal.style.display = 'none';
}

export function initImports(elementRegistry, version, modeler,eventBus, titleInputLast, fnDebounce) {
  document.getElementById('import').onchange = function() {

    var input = document.getElementById('import').files[0];

    initElementRegistry(elementRegistry);

    importDST(input, version, modeler);

    // to update the title of the svg, we need to tell the command stack, that a value has changed
    var exportArtifacts = debounce(fnDebounce, 500);

    eventBus.fire('commandStack.changed', exportArtifacts);

    titleInputLast = titleInput.value;
  };

  document.getElementById('importIcon').onchange = function() {
    var input = document.getElementById('importIcon').files[0];
    var reader = new FileReader();
    var endIndex = input.name.lastIndexOf('.');
    var name = input.name.substring(0, endIndex);
    while (name.includes(' ')) {
      name = name.replace(' ', '-');
    }

    reader.onloadend = function(e) {
      var file = e.target.result;
      addIMGToIconDictionary(file, name);
    };

    reader.readAsDataURL(input);
  };


  document.getElementById('importConfig').onchange = function() {
    var input = document.getElementById('importConfig').files[0];

    importConfiguration(input);
  };
}

export function loadPersistedDST(modeler) {
  var persitedStory = localStorage.getItem(storyPersistTag);
  localStorage.removeItem(storyPersistTag);

  var completeJSON = JSON.parse(persitedStory);

  var titleText = completeJSON.title;

  var title = document.getElementById('title');
  title.innerText = titleText;

  var elements = completeJSON.objects;
  var lastElement = elements.pop();

  var importVersionNumber = lastElement;
  if (lastElement.version) {
    lastElement = elements.pop();
  }

  if (importVersionNumber.version) {
    importVersionNumber = importVersionNumber.version;
  } else {
    importVersionNumber = '?';
  }

  updateIconRegistries(elements);

  var inputInfoText = lastElement.info ? lastElement.info : '';
  info.innerText = inputInfoText;
  info.value = inputInfoText;
  infoText.innerText = inputInfoText;

  modeler.importCustomElements(elements);
  correctElementRegitryInit();

  cleanDictionaries();

  removeDirtyFlag();
}

export function importDST(input, version, modeler) {

  var reader = new FileReader();
  if (input.name.endsWith('.dst')) {
    var titleText = input.name.replace(/_\d+-\d+-\d+( ?_?-?\(\d+\))?(-?\d)?.dst/, '');
    if (titleText.includes('.dst')) {
      titleText = titleText.replace('.dst','');
    }
    titleInput.value = titleText;
    title.innerText = titleText;

    reader.onloadend = function(e) {

      readerFunction(e.target.result, version, modeler);
    };

    reader.readAsText(input);
  }
}

export function readerFunction(text, version, modeler) {
  var config;
  var configChanged = false;
  var elements;
  var dstAndConfig = JSON.parse(text);
  if (dstAndConfig.config) {
    config = dstAndConfig.config;
    configChanged = configHasChanged(config);
    elements = JSON.parse(dstAndConfig.dst);
  } else {
    elements = JSON.parse(text);
  }

  var lastElement = elements.pop();

  var importVersionNumber = lastElement;
  if (lastElement.version) {
    lastElement = elements.pop();
  }

  if (domExists()) {
    if (importVersionNumber.version) {
      importVersionNumber = importVersionNumber.version;
    } else {
      importVersionNumber = '?';
    }

    if (version != importVersionNumber) {
      importedVersionLabel.innerText = 'v' + importVersionNumber;
      modelerVersionLabel.innerText = 'v' + version;
      showVersionDialog();
      elements = updateCustomElementsPreviousv050(elements);
    }

    var allReferences = checkElementReferencesAndRepair(elements);

    if (!allReferences) {
      showBrokenDSTDialog();
    }

    var inputInfoText = lastElement.info ? lastElement.info : '';
    info.innerText = inputInfoText;
    info.value = inputInfoText;
    infoText.innerText = inputInfoText;

    adjustPositions(elements);
  }

  if (config) {
    loadConfiguration(config);
  }

  updateIconRegistries(elements);
  modeler.importCustomElements(elements);

  if (domExists()) {
    if (configChanged) {
      saveIconConfiguration();
    }
    correctElementRegitryInit();

    cleanDictionaries();
    correctGroupChildren();

    removeDirtyFlag();
  }
}

export function configHasChanged(config) {
  var dictionary = require('collections/dict');
  var customConfigJSON = JSON.parse(config);
  var newActorsDict = new dictionary();
  var newWorkObjectsDict = new dictionary();

  newActorsDict.addEach(customConfigJSON.actors);
  newWorkObjectsDict.addEach(customConfigJSON.workObjects);

  var newActorKeys = newActorsDict.keysArray();
  var newWorkObjectKeys = newWorkObjectsDict.keysArray();
  var currentActorKeys = getActorIconDictionaryKeys();
  var currentWorkobjectKeys = getWorkObjectIconDictionaryKeys();

  var changed = false;
  var i=0;

  for (i=0; i<newActorKeys.length; i++) {
    if (!currentActorKeys.includes(newActorKeys[i]) && !currentActorKeys.includes(ACTOR + newActorKeys[i])) {
      changed = true;
      i = newActorKeys.length;
    }
  }

  if (changed) {
    for (i=0; i<newWorkObjectKeys.length; i++) {
      if (!currentWorkobjectKeys.includes(newWorkObjectKeys[i]) && !currentWorkobjectKeys.includes(WORKOBJECT + newWorkObjectKeys[i])) {
        changed = true;
        i = newWorkObjectKeys.length;
      }
    }
  }
  return changed;
}

// when importing a domain-story, the elements that are visually inside a group are not yet associated with it.
// to ensure they are correctly associated, we add them to the group
function correctGroupChildren() {
  var allObjects = getAllCanvasObjects();
  var groups = getAllGroups();

  groups.forEach(group => {
    var parent = group.parent;
    parent.children.slice().forEach(innerShape => {
      if ((innerShape.id) != group.id) {
        if (innerShape.x >= group.x && innerShape.x <= group.x + group.width) {
          if (innerShape.y >= group.y && innerShape.y <= group.y + group.height) {
            innerShape.parent = group;
            if (!group.children.includes(innerShape)) {
              group.children.push(innerShape);
            }
          }
        }
      }
    });
  });
  allObjects.forEach(shape => {
    var businessObject = shape.businessObject;
    if (isInDomainStoryGroup(shape)) {
      assign(businessObject, {
        parent: shape.parent.id
      });
    }
  });
}

/**
 * Ensure backwards compatability.
 * Previously Document had no special name and was just adressed as workObject
 * Bubble was renamed to Conversation
 */

export function updateCustomElementsPreviousv050(elements) {

  for (var i=0; i< elements.length; i++) {
    if (elements[i].type === WORKOBJECT) {
      elements[i].type = WORKOBJECT + 'Document';
    } else if (elements[i].type === WORKOBJECT + 'Bubble') {
      elements[i].type = WORKOBJECT + 'Conversation';
    }
  }
  return elements;
}

function adjustPositions(elements) {
  var xLeft , yUp;
  var isFirst = true;

  elements.forEach(element => {
    var elXLeft, elYUp;
    if (element.type != ACTIVITY && element.type != CONNECTION) {
      if (isFirst) {
        xLeft = parseFloat(element.x);
        yUp = parseFloat(element.y);
        isFirst = false;
      }
      elXLeft= parseFloat(element.x);
      elYUp = parseFloat(element.y);
      if (elXLeft < xLeft) {
        xLeft = elXLeft;
      }
      if (elYUp < yUp) {
        yUp = elYUp;
      }
    }
  });

  if (xLeft < 75 || xLeft > 150 || yUp < 0 || yUp > 50) {
    // add Padding for the Palette and the top
    xLeft -= 75;
    yUp -= 50;

    elements.forEach(element => {
      if (element.type == ACTIVITY || element.type == CONNECTION) {
        var waypoints = element.waypoints;
        waypoints.forEach(point => {
          point.x -= xLeft;
          point.y -= yUp;

          if (point.original) {
            point.original.x = point.x;
            point.original.y = point.y;
          }
        });
      } else {
        element.x -= xLeft;
        element.y -= yUp;
      }
    });
  }
}

function updateIconRegistries(elements) {
  var actorIcons = getElementsOfType(elements, 'actor');
  var workObjectIcons = getElementsOfType(elements, 'workObject');

  if (!allInActorIconDictionary(actorIcons)) {
    registerActorIcons(actorIcons);
  }
  if (!allInWorkObjectIconDictionary(workObjectIcons)) {
    registerWorkObjectIcons(workObjectIcons);
  }
}

function getElementsOfType(elements, type) {
  var elementOfType =[];
  elements.forEach(element => {
    if (element.type.includes(DOMAINSTORY + type)) {
      elementOfType.push(element);
    }
  });
  return elementOfType;
}

function showVersionDialog() {
  versionInfo.style.display = 'block';
  modal.style.display = 'block';
}

function showBrokenDSTDialog() {
  brokenDSTInfo.style.display = 'block';
  modal.style.display = 'block';
}