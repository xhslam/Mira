require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'InkstoneWorkspaceAccess'
  s.version          = package['version']
  s.summary          = 'Persistent security-scoped workspace bookmarks for Inkstone.'
  s.description      = s.summary
  s.license          = { :type => 'MIT' }
  s.author           = 'Inkstone'
  s.homepage         = 'https://localhost/inkstone'
  s.platforms        = { :ios => '16.4' }
  s.swift_version    = '5.9'
  s.source           = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
