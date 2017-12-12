'use strict';

const $start = document.querySelector('#start-your-portal')
const $create = document.querySelector('#create-portal')
const $closeCongrats = document.querySelector('#close-congrats-page')

$create.addEventListener('click', createPortal)
$closeCongrats.addEventListener('click', goToPane.bind(null, 'create-portal-page'))

const state = { avatar_image: null }

initPanes()
initAvatar()

function initPanes ()
{
  const $active = document.querySelector('.pane-view > .pane--active')
  goToPane($active.id)
}

function goToPane (id)
{
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

async function createPortal () {
  const $name = document.querySelector('#name')
  const $description = document.querySelector('#description')
  const $website = document.querySelector('#website')

  const name = $name.value.trim();
  const description = $description ? $description.value || "" : "";
  const site = $website ? $website.value || "" : "";

  if (!validateName(name)) { return; }

  setLoadingButton($create)

  const client_url = await DatArchive.resolveName(window.location.href)
  const client = await new DatArchive(client_url)
  await client.download('/template')

  let portal;
  try {
    portal = await DatArchive.create({
      title: `~${name}`,
      description,
    })
  } catch (err) {
    unsetLoadingButton($create)
    return;
  }

  const portal_str = {
    name: name,
    desc: description,
    port: [],
    feed: [],
    site: site,
    dat: portal.url
  }

  await portal.writeFile('/portal.json', JSON.stringify(portal_str));

  await copyDir(client, "/template/", portal, "/")

  let icon = state.avatar_image;
  if (!icon) { icon = await client.readFile('/media/logo.svg') }
  await portal.writeFile('/media/content/icon.svg', icon);

  unsetLoadingButton($create)

  await portal.commit();
  open(portal.url)
  goToPane('congrats-page')
}

async function copyDir(src, src_folder, dest, dest_folder) {
  await src.download(src_folder)
  const entries = await src.readdir(src_folder, { recursive: true, stat: true })
  const directories = entries.filter((entry) => entry.stat.isDirectory())
  const files = entries.filter((entry) => entry.stat.isFile())

  for (const entry of directories) {
    await dest.mkdir(`${dest_folder}${entry.name}`)
  }

  let copies = []
  for (const entry of files) {
    const src_path = `${src_folder}${entry.name}`
    const dest_path = `${dest_folder}${entry.name}`
    copies.push(copyFile(src, src_path, dest, dest_path))
  }

  await Promise.all(copies)
}

async function copyFile(src, src_path, dest, dest_path) {
  const contents = await src.readFile(src_path)
  await dest.writeFile(dest_path, contents)
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

function svgToUrl(string)
{
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

function setLoadingButton($button) {
  const text = $button.innerText
  $button.setAttribute("data-loading-text", text)
  $button.setAttribute("disabled", true)
  $button.innerHTML = ""
}

function unsetLoadingButton($button) {
  const text = $button.getAttribute("data-loading-text")
  $button.innerHTML = text
  $button.removeAttribute("data-loading-text")
  $button.removeAttribute("disabled")
}

// Drag avatar

document.getElementById("name").addEventListener('keydown', function(event){
  if (event.key === "Enter") {
    event.preventDefault();
    createPortal();
  }
});

async function load_avatar(file)
{
  const svg = await readAvatar(file)
  const $image = document.querySelector('.field.avatar img')
  $image.src = svgToUrl(svg)
  state.avatar_image = svg
}

window.addEventListener('dragover',function(e)
{
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('drop', function(e)
{
  e.stopPropagation();
  e.preventDefault();

  var files = e.dataTransfer.files;
  var file = files[0];

  if (file.type && !file.type.match(/image\/svg.*/)) { console.log("Not svg", file.type); return false; }
  load_avatar(file);
});