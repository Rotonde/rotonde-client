'use strict';

const $ignition = document.querySelector('#ignition')
const $close = document.querySelector('#close')
const $liftoff = document.querySelector('#liftoff')

$ignition.addEventListener('click', goToPane.bind(null, 'create-portal'))
$close.addEventListener('click', goToPane.bind(null, 'landing-page'))
$liftoff.addEventListener('click', liftoff)

// pre download the ref implementation so its ready when they fork
const neauoire_url = "dat://2f21e3c122ef0f2555d3a99497710cd875c7b0383f998a2d37c02c042d598485/"
const neauoire_archive = new DatArchive(neauoire_url)
const state = {
  avatar_image: null
}

neauoire_archive.download()

initPanes()
initAvatar()

function initPanes () {
  const $active = document.querySelector('.pane-view > .pane--active')
  goToPane($active.id)
}

function goToPane (id) {
  const $target = document.querySelector(`.pane-view > .pane#${id}`)
  const $others = document.querySelectorAll(`.pane-view > .pane:not(#${id})`)

  $target.classList.add('pane--active')
  for (const $input of $target.querySelectorAll('[tabindex]')) {
    $input.setAttribute('tabindex', 0)
  }

  for (const $pane of $others) {
    $pane.classList.remove('pane--active')
    for (const $input of $pane.querySelectorAll('[tabindex]')) {
      $input.setAttribute('tabindex', -1)
    }
  }
}

function validateName (name) {
  const $field = document.querySelector('#name').parentNode;
  if (!name) {
    $field.setAttribute('data-invalid', "Name is Required")
    return false
  }

  if (/\s/.test(name)) {
    $field.setAttribute('data-invalid', "A name can't have white space")
    return false
  }
  return true
}

async function liftoff () {

  const $name = document.querySelector('#name')
  const $description = document.querySelector('#description')
  const $website = document.querySelector('#website')

  const name = $name.value.trim();
  const description = $description.value || "";
  const site = $website.value || "";

  if (!validateName(name)) { return; }

  const launchpad_url = await DatArchive.resolveName(window.location.href)
  const launchpad = await new DatArchive(launchpad_url)

  const portal = await DatArchive.fork(neauoire_url, {
    title: `~${name}`,
    description,
  })

  await cleanArchive(portal)

  const portal_str = {
    name: name,
    desc: description,
    port: [],
    feed: [],
    site: site,
    dat: portal.url
  }

  await portal.writeFile('/portal.json', JSON.stringify(portal_str));

  let icon = state.avatar_image;
  if (!icon) { icon = await launchpad.readFile('/site/icon.svg') }
  await portal.writeFile('/media/content/icon.svg', icon);

  await portal.commit();
  open(portal.url)
}

async function cleanArchive(archive) {
  const root = await archive.readdir('/')
  const frozen_files = root.filter((path) => path.startsWith('frozen-'))

  for (const file of frozen_files) {
    await archive.unlink(file)
  }
}

function initAvatar($input) {
  const $avatar = document.querySelector('.field.avatar input[type="file"]')
  $avatar.addEventListener('change', async () => {
    const file = $avatar.files[0]
    if (!validateAvatar(file)) { return; }
    const svg = await readAvatar(file)
    const $image = document.querySelector('.field.avatar img')
    $image.src = svgToUrl(svg)
    state.avatar_image = svg
  })
}

// Am I doing this right??
function readAvatar(file) {
  let reader = new FileReader()
  reader.readAsText(file)
  return new Promise((resolve, reject) => {
    reader.addEventListener('load', () => {
      resolve(reader.result)
    })
    reader.addEventListener('error', () => {
      reject(reader.error)
    })
  })
}

function svgToUrl(string) {
  return `data:image/svg+xml;base64,${window.btoa(string)}`
}

function validateAvatar(file) {
  const $field = document.querySelector('.field.avatar')
  if (file.type == "image/svg+xml") {
    $field.removeAttribute('data-invalid')
    return true
  } else {
    $field.setAttribute('data-invalid', "Image must be an svg")
    return false
  }
}
